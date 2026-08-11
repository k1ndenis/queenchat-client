import { useEffect, useRef, useState, useCallback } from 'react';
import { globalSocket } from '../lib/socket';
import { fetchWithAuth } from '../lib/api';

interface WebRTCHookProps {
  chatId: string;
  currentUserId: string;
  listenAllIncoming?: boolean;
  handleIncomingOffers?: boolean;
}

interface PeerConnectionData {
  peer: RTCPeerConnection;
  isInitiator: boolean;
  streamCallback: (stream: MediaStream) => void;
}

type CallSignalType = 'cancel_call' | 'decline_call' | 'end_call' | 'missed_call';

const CLIENT_CALL_TIMEOUT_FALLBACK_MS = 35000;
const GOOGLE_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const FALLBACK_ICE_CONFIGURATION: RTCConfiguration = {
  iceServers: GOOGLE_STUN_SERVERS,
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  rtcpMuxPolicy: 'require',
};

type IceServersResponse = { iceServers?: RTCIceServer[] };
const callPeerKey = (callId: string | null | undefined, peerId: string) => `${callId || 'legacy'}:${peerId}`;
export const useWebRTC = ({
  chatId,
  currentUserId,
  listenAllIncoming = false,
  handleIncomingOffers = true,
}: WebRTCHookProps) => {
  // ===== STATE =====
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{ from: string; chatId: string; offer?: any; callId?: string } | null>(null);
  
  // ===== REFS =====
  const peersRef = useRef<Map<string, PeerConnectionData>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  // Candidates are scoped to the negotiation, not to a chat view or a user
  // alone. A new call with the same person must never consume stale ICE.
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const isStreamInitializing = useRef(false);
  const streamInitPromise = useRef<Promise<MediaStream> | null>(null);
  const isCallActiveRef = useRef(false);
  const isCallingRef = useRef(false);
  const isIncomingRingingRef = useRef(false);
  const activeCallIdRef = useRef<string | null>(null);
  const activePeerIdRef = useRef<string | null>(null);
  const activeChatIdRef = useRef<string | null>(null);
  const componentMounted = useRef(true);
  const outgoingTimeoutRef = useRef<number | null>(null);
  const incomingTimeoutRef = useRef<number | null>(null);
  // Keep the global WebSocket listener stable while React state changes. A
  // listener gap here can drop a one-shot incoming offer.
  const currentUserIdRef = useRef(currentUserId);
  const incomingCallRef = useRef(incomingCall);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  const createCallId = useCallback(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);

  const clearCallTimers = useCallback(() => {
    if (outgoingTimeoutRef.current) {
      window.clearTimeout(outgoingTimeoutRef.current);
      outgoingTimeoutRef.current = null;
    }
    if (incomingTimeoutRef.current) {
      window.clearTimeout(incomingTimeoutRef.current);
      incomingTimeoutRef.current = null;
    }
  }, []);

  const emitCallSignal = useCallback((targetUserId: string, signalType: CallSignalType, callId: string | null) => {
    if (!targetUserId) return;
    void globalSocket.emit('webrtc', {
      target_user_id: targetUserId,
      signal_type: signalType,
      signal: {},
      chat_id: activeChatIdRef.current || chatId,
      call_id: callId
    }).catch(error => console.error('[WebRTC] Failed to send call signal', error));
  }, [chatId]);

  const queueIceCandidate = useCallback((callId: string | null | undefined, senderId: string, candidate: RTCIceCandidateInit) => {
    const key = callPeerKey(callId, senderId);
    if (!pendingCandidatesRef.current.has(key)) {
      pendingCandidatesRef.current.set(key, []);
    }
    pendingCandidatesRef.current.get(key)!.push(candidate);
    console.info('[CallFlow] CANDIDATE_QUEUED', { call_id: callId, sender_id: senderId });
  }, []);

  const flushPendingCandidates = useCallback(async (callId: string | null | undefined, targetUserId: string, pc: RTCPeerConnection) => {
    const key = callPeerKey(callId, targetUserId);
    const candidates = pendingCandidatesRef.current.get(key);
    if (!candidates || candidates.length === 0) return;

    // Sequential add preserves arrival order and makes failures visible.
    for (const candidate of candidates) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.info('[CallFlow] CANDIDATE_FLUSHED', { call_id: callId, sender_id: targetUserId });
    }
    pendingCandidatesRef.current.delete(key);
  }, []);

  const cleanupCall = useCallback((
    targetUserId?: string | null,
    options: { fromRemote?: boolean; signalType?: CallSignalType; dispatchEvent?: boolean } = {}
  ) => {
    const peerId = targetUserId || activePeerIdRef.current;
    const callId = activeCallIdRef.current;
    const { fromRemote = false, signalType, dispatchEvent = true } = options;

    clearCallTimers();
    if (callId) {
      try {
        const raw = localStorage.getItem('queenchat_pending_incoming_call');
        const pending = raw ? JSON.parse(raw) : null;
        if (pending?.callId === callId) {
          localStorage.removeItem('queenchat_pending_incoming_call');
        }
      } catch {}
    }

    if (!fromRemote && peerId && signalType) {
      emitCallSignal(peerId, signalType, callId);
    }

    const closePeer = (data: PeerConnectionData) => {
      try {
        data.peer.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        data.peer.close();
      } catch (e) {
        console.error('Error closing peer:', e);
      }
    };

    if (peerId) {
      const peerData = peersRef.current.get(callPeerKey(callId, peerId));
      if (peerData) {
        closePeer(peerData);
        peersRef.current.delete(callPeerKey(callId, peerId));
      }
      pendingCandidatesRef.current.delete(callPeerKey(callId, peerId));
    } else {
      peersRef.current.forEach(closePeer);
      peersRef.current.clear();
      pendingCandidatesRef.current.clear();
    }

    if (localStreamRef.current) {
      try {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        console.error('Error stopping tracks:', e);
      }
      localStreamRef.current = null;
    }

    if (componentMounted.current) {
      setLocalStream(null);
      setRemoteStream(null);
      setIsCallActive(false);
      setIsCalling(false);
      setIncomingCall(null);
    }

    isCallActiveRef.current = false;
    isCallingRef.current = false;
    isIncomingRingingRef.current = false;
    activeCallIdRef.current = null;
    activePeerIdRef.current = null;
    activeChatIdRef.current = null;

    if (dispatchEvent) {
      window.dispatchEvent(new CustomEvent('call_ended', {
        detail: { targetUserId: peerId, fromRemote, signalType }
      }));
      if (signalType === 'missed_call') {
        window.dispatchEvent(new CustomEvent('call_missed', {
          detail: { targetUserId: peerId, fromRemote }
        }));
      }
    }
  }, [clearCallTimers, emitCallSignal]);

  const showIncomingCallNotification = useCallback((callerId: string, callId?: string | null, signalChatId?: string | null) => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

    const notification = new Notification('Incoming video call', {
      body: 'Incoming call',
      tag: callId ? `call:${callId}` : `call:${signalChatId}:${callerId}`,
      requireInteraction: true,
      silent: true,
      data: {
        callId,
        callerId,
        chatId: signalChatId,
        callType: 'video',
      },
    });

    notification.onclick = () => {
      window.focus();
      if (signalChatId) {
        window.location.href = `/chat/${signalChatId}`;
      }
      notification.close();
    };
  }, []);
  
  // TURN REST credentials are short-lived, so fetch them immediately before each
  // new PeerConnection. Never fall back to STUN-only: that would hide a TURN/API
  // failure and makes calls from restrictive networks fail without an explanation.
  const fetchIceConfiguration = useCallback(async (): Promise<RTCConfiguration | null> => {
    let status: number | 'network_error' = 'network_error';
    try {
      const response = await fetchWithAuth('/webrtc/ice-servers');
      status = response.status;
      if (!response.ok) {
        console.error('[WebRTC] Failed to fetch TURN/ICE configuration', { status });
        return null;
      }

      const payload = await response.json() as IceServersResponse;
      if (!Array.isArray(payload.iceServers) || payload.iceServers.length === 0) {
        console.error('[WebRTC] Invalid TURN/ICE configuration response');
        return null;
      }

      // Keep Google STUN alongside the authenticated first-party TURN fallback.
      return {
        ...FALLBACK_ICE_CONFIGURATION,
        iceServers: [...GOOGLE_STUN_SERVERS, ...payload.iceServers],
        iceTransportPolicy: 'all',
      };
    } catch {
      console.error('[WebRTC] Failed to fetch TURN/ICE configuration', { status });
      return null;
    }
  }, []);

  // ===== УПРАВЛЕНИЕ ЛОКАЛЬНЫМ СТРИМОМ =====
  const initLocalStream = useCallback(async (): Promise<MediaStream> => {
    if (localStreamRef.current && localStreamRef.current.active) {
      return localStreamRef.current;
    }

    if (isStreamInitializing.current && streamInitPromise.current) {
      return streamInitPromise.current;
    }

    isStreamInitializing.current = true;
    
    const promise = (async () => {
      try {
        console.log('🎥 [WebRTC] Requesting camera/microphone access...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        
        console.log('✅ [WebRTC] Got local stream, tracks:', stream.getTracks().map(t => t.kind));
        localStreamRef.current = stream;
        
        if (componentMounted.current) {
          setLocalStream(stream);
        }
        
        return stream;
      } catch (error) {
        console.error('❌ [WebRTC] Error accessing media:', error);
        throw error;
      } finally {
        isStreamInitializing.current = false;
        streamInitPromise.current = null;
      }
    })();

    streamInitPromise.current = promise;
    return promise;
  }, []);

  // ===== СОЗДАНИЕ PEER CONNECTION =====
  const createPeerConnection = useCallback((
    targetUserId: string,
    callId: string,
    isInitiator: boolean,
    onStream: (stream: MediaStream) => void,
    iceConfiguration: RTCConfiguration,
  ): RTCPeerConnection => {
    console.log(`🔧 [WebRTC] Creating peer for ${targetUserId}, initiator: ${isInitiator}`);
    const key = callPeerKey(callId, targetUserId);
    
    // Закрываем старый пир если есть
    const existing = peersRef.current.get(key);
    if (existing) {
      // A call owns one RTCPeerConnection for its entire lifetime.
      return existing.peer;
    }

    const pc = new RTCPeerConnection(iceConfiguration);
    
    // Сохраняем данные пира
    peersRef.current.set(key, {
      peer: pc,
      isInitiator,
      streamCallback: onStream
    });

    // ===== ICE СОБЫТИЯ =====
    pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState;
    console.info('[CallFlow] ICE_STATE', { call_id: callId, sender_id: currentUserIdRef.current, target_user_id: targetUserId, state });
    
      if (state === 'connected' || state === 'completed') {
	      console.log('✅ [WebRTC] ICE connected!');
        clearCallTimers();
	      if (componentMounted.current) {
	        setIsCallActive(true);
	        setIsCalling(false);
	        isCallActiveRef.current = true;
          isCallingRef.current = false;
          isIncomingRingingRef.current = false;
	        activePeerIdRef.current = targetUserId;
      }
	    } else if (state === 'failed') {
	      console.error('❌ [WebRTC] ICE failed!');
        cleanupCall(targetUserId, { signalType: 'end_call' });
	    } else if (state === 'disconnected') {
	      console.warn('⚠️ [WebRTC] ICE disconnected, restarting...');
	      pc.restartIce();
    } else if (state === 'closed') {
      console.log('🔴 [WebRTC] ICE closed');
      if (componentMounted.current) {
        setIsCallActive(false);
        isCallActiveRef.current = false;
        activeCallIdRef.current = null;
        activePeerIdRef.current = null;
      }
    }
  };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.info('[CallFlow] CONNECTION_STATE', { call_id: callId, sender_id: currentUserIdRef.current, target_user_id: targetUserId, state });
      
      if (state === 'connected') {
        console.log('✅ [WebRTC] Connection established!');
        clearCallTimers();
      } else if (state === 'failed') {
        console.error('❌ [WebRTC] Connection failed!');
        cleanupCall(targetUserId, { signalType: 'end_call' });
      } else if (state === 'closed') {
        console.log('🔴 [WebRTC] Connection closed');
        if (componentMounted.current) {
          setIsCallActive(false);
          isCallActiveRef.current = false;
          activeCallIdRef.current = null;
        }
      }
    };

    pc.onicecandidateerror = (event) => {
      console.error('[WebRTC] TURN/ICE candidate error', { errorCode: event.errorCode, errorText: event.errorText });
    };

    // ===== ICE CANDIDATES =====
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.info('[CallFlow] CANDIDATE_SENT', { call_id: callId, sender_id: currentUserIdRef.current, target_user_id: targetUserId });
        void globalSocket.emit('webrtc', {
          target_user_id: targetUserId,
          signal_type: 'candidate',
          signal: event.candidate,
          chat_id: activeChatIdRef.current || chatId,
          call_id: callId
        }).catch(error => console.error('[WebRTC] Failed to send ICE candidate', error));
      }
    };

    // ===== REMOTE STREAM =====
  pc.ontrack = (event) => {
    console.log(`📺 [WebRTC] ontrack event from ${targetUserId}:`, event);
    
    // Проверяем, что есть треки
    if (!event.track) {
      console.warn('⚠️ [WebRTC] No track in event');
      return;
    }
    
    console.log(`📺 [WebRTC] Track kind: ${event.track.kind}`);
    
    // Получаем стрим из события или создаем новый
    let stream: MediaStream;
    if (event.streams && event.streams.length > 0) {
      stream = event.streams[0];
      console.log(`📺 [WebRTC] Got stream from event with ${stream.getTracks().length} tracks`);
    } else {
      console.warn('⚠️ [WebRTC] No streams in event, creating new');
      stream = new MediaStream();
      stream.addTrack(event.track);
    }
    
    // Проверяем, что стрим активен
    if (!stream.active) {
      console.warn('⚠️ [WebRTC] Stream is not active');
      return;
    }
    
    console.log(`📺 [WebRTC] Stream tracks:`, stream.getTracks().map(t => `${t.kind} (${t.enabled ? 'enabled' : 'disabled'})`));
    
    // Обновляем состояние
    if (componentMounted.current) {
      setRemoteStream(stream);
      setIsCallActive(true);
      setIsCalling(false);
      isCallActiveRef.current = true;
      isCallingRef.current = false;
      isIncomingRingingRef.current = false;
      activePeerIdRef.current = targetUserId;
      setIncomingCall(null);
    }
    
    // Вызываем callback
    onStream(stream);
  };

    // ===== ДОБАВЛЯЕМ ЛОКАЛЬНЫЙ СТРИМ =====
    if (localStreamRef.current && localStreamRef.current.active) {
      console.log(`📤 [WebRTC] Adding local tracks to peer for ${targetUserId}`);
      localStreamRef.current.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStreamRef.current!);
          console.log(`📤 [WebRTC] Added ${track.kind} track`);
        } catch (err) {
          console.error(`❌ [WebRTC] Error adding ${track.kind} track:`, err);
        }
      });
    } else {
      console.warn(`⚠️ [WebRTC] No local stream for ${targetUserId}`);
    }

    return pc;
  }, [chatId, cleanupCall, clearCallTimers]);

  // ===== НАЧАТЬ ЗВОНОК =====
  const startCall = useCallback(async (targetUserId: string, callChatId = chatId) => {
    if (!targetUserId || targetUserId === currentUserId) {
      console.warn('⚠️ [WebRTC] Invalid target user');
      return;
    }

    if (isCallActiveRef.current && activePeerIdRef.current === targetUserId) {
      console.warn('⚠️ [WebRTC] Call already active with this user');
      return;
    }

    if (isCallActiveRef.current) {
      console.warn('⚠️ [WebRTC] Already in a call');
      return;
    }

    console.info('[CallTrace] start_call', { target_user_id: targetUserId, chat_id: callChatId });
    const callId = createCallId();
    activeCallIdRef.current = callId;
    activePeerIdRef.current = targetUserId;
    activeChatIdRef.current = callChatId;
    
    // Calls use the application-wide signalling connection. ChatRoom may be
    // unmounted or switched while a call is negotiating.
    try {
      await globalSocket.ensureConnectedAndAlive();
    } catch (error) {
      console.error('[CallTrace] outgoing_signal_socket_unavailable', {
        socket: 'global',
        connected: globalSocket.isConnected(),
        scope: globalSocket.getScope(),
        target_user_id: targetUserId,
        chat_id: chatId,
        call_id: callId,
        message: error instanceof Error ? error.message : String(error),
      });
      cleanupCall(targetUserId, { signalType: 'cancel_call' });
      return;
    }

    // Получаем локальный стрим
    let stream = localStreamRef.current;
    if (!stream || !stream.active) {
      try {
        stream = await initLocalStream();
	      } catch (error) {
	        console.error('❌ [WebRTC] Failed to get local stream:', error);
          cleanupCall(targetUserId, { signalType: 'cancel_call' });
	        return;
	      }
    }

    if (!stream || !stream.active) {
      console.error('❌ [WebRTC] No active local stream');
      return;
    }

    // Создаем стрим-коллбек
    const onStream = (remoteStream: MediaStream) => {
      console.log('📺 [WebRTC] Remote stream received in startCall');
      if (componentMounted.current) {
        setRemoteStream(remoteStream);
      }
    };

    const iceConfiguration = await fetchIceConfiguration();
    if (!iceConfiguration) {
      cleanupCall(targetUserId, { signalType: 'cancel_call' });
      return;
    }

    // Создаем пир
    const pc = createPeerConnection(targetUserId, callId, true, onStream, iceConfiguration);
    
    // Создаем offer
    try {
      console.log('📤 [WebRTC] Creating offer...');
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      console.log('📤 [WebRTC] Setting local description...');
      await pc.setLocalDescription(offer);
      console.info('[CallTrace] offer_created', { target_user_id: targetUserId, chat_id: chatId, call_id: callId });
      
      console.log('📤 [WebRTC] Sending offer...');
      console.info('[CallTrace] outgoing_signal_attempt', {
        socket: 'global',
        connected: globalSocket.isConnected(),
        target_user_id: targetUserId,
        chat_id: chatId,
        call_id: callId,
        signal_type: 'offer',
      });
      try {
        await globalSocket.emit('webrtc', {
          target_user_id: targetUserId,
          signal_type: 'offer',
          signal: offer,
          chat_id: callChatId,
          call_id: callId
        });
        console.info('[CallFlow] OFFER_SENT', { call_id: callId, sender_id: currentUserId, target_user_id: targetUserId });
        console.info('[CallTrace] outgoing_signal_result', {
          success: true,
          target_user_id: targetUserId,
          chat_id: chatId,
          call_id: callId,
        });
        console.info('[CallTrace] outgoing_signal_sent', { target_user_id: targetUserId, chat_id: chatId, call_id: callId });
      } catch (error) {
        console.error('[CallTrace] outgoing_signal_result', {
          success: false,
          target_user_id: targetUserId,
          chat_id: chatId,
          call_id: callId,
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
      
	      if (componentMounted.current) {
	        setIsCalling(true);
	      }
        isCallingRef.current = true;
	      
	      console.log('✅ [WebRTC] Offer sent successfully');
        outgoingTimeoutRef.current = window.setTimeout(() => {
          console.warn('⚠️ [WebRTC] Outgoing call server-timeout fallback');
          cleanupCall(targetUserId, { fromRemote: true, signalType: 'missed_call' });
        }, CLIENT_CALL_TIMEOUT_FALLBACK_MS);
	    } catch (error) {
	      console.error('❌ [WebRTC] Error creating offer:', error);
        cleanupCall(targetUserId, { signalType: 'cancel_call' });
	    }
  }, [currentUserId, chatId, initLocalStream, createPeerConnection, createCallId, cleanupCall, fetchIceConfiguration]);

  // ===== ОТВЕТИТЬ НА ЗВОНОК =====
  const answerCall = useCallback(async (
    fromUserId: string,
    offer: RTCSessionDescriptionInit,
    callId?: string,
    initialCandidates: RTCIceCandidateInit[] = [],
    incomingChatId?: string,
  ): Promise<boolean> => {
    const targetChatId = incomingChatId || activeChatIdRef.current || chatId;
    
    if (!offer) {
      console.warn('[CallAccept] failed stage=offer_missing');
      return false;
    }
    if (!targetChatId) {
      console.warn('[CallAccept] failed stage=chat_target_missing');
      return false;
    }

	    if (activeCallIdRef.current && callId && activeCallIdRef.current !== callId) {
      console.warn('⚠️ [WebRTC] Ignoring answer request for stale call');
      return false;
    }
	    activeCallIdRef.current = callId || activeCallIdRef.current || createCallId();
	    activePeerIdRef.current = fromUserId;
    activeChatIdRef.current = targetChatId;
	      clearCallTimers();

    try {
      await globalSocket.ensureConnectedAndAlive();
      console.info('[CallAccept] global signaling socket ready');
    } catch (error) {
      console.warn('[CallAccept] failed stage=socket_ready', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }

	    // Получаем локальный стрим
    let stream = localStreamRef.current;
	    if (!stream || !stream.active) {
	      try {
        stream = await initLocalStream();
	      console.info('[CallAccept] getUserMedia ok');
	      } catch (error) {
          console.warn('[CallAccept] failed stage=getUserMedia', { error: error instanceof Error ? error.message : String(error) });
          cleanupCall(fromUserId, { fromRemote: true, dispatchEvent: false });
	        return false;
	      }
	    }

    // Создаем стрим-коллбек
    const onStream = (remoteStream: MediaStream) => {
      console.log('📺 [WebRTC] Remote stream received in answerCall');
      if (componentMounted.current) {
        setRemoteStream(remoteStream);
      }
    };

    const iceConfiguration = await fetchIceConfiguration();
    if (!iceConfiguration) {
      cleanupCall(fromUserId, { fromRemote: true, dispatchEvent: false });
      return false;
    }

    // Создаем пир
    const activeCallId = activeCallIdRef.current!;
    const pc = createPeerConnection(fromUserId, activeCallId, false, onStream, iceConfiguration);
    console.info('[CallAccept] createPeerConnection ok', { caller_id: fromUserId });

    try {
      initialCandidates.forEach(candidate => queueIceCandidate(activeCallId, fromUserId, candidate));
	      console.log('📤 [WebRTC] Setting remote description...');
	      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      console.info('[CallAccept] setRemoteDescription ok');
      await flushPendingCandidates(activeCallId, fromUserId, pc);
      
      console.log('📤 [WebRTC] Creating answer...');
      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      console.info('[CallAccept] createAnswer ok');
      
      console.log('📤 [WebRTC] Setting local description...');
      await pc.setLocalDescription(answer);
      console.info('[CallAccept] setLocalDescription ok');
      
      console.log('📤 [WebRTC] Sending answer...');
      await globalSocket.emit('webrtc', {
        target_user_id: fromUserId,
        signal_type: 'answer',
        signal: answer,
        chat_id: activeChatIdRef.current || chatId,
        call_id: activeCallIdRef.current
      });
      console.info('[CallFlow] ANSWER_SENT', { call_id: activeCallId, sender_id: currentUserId, target_user_id: fromUserId });
      console.info('[CallAccept] answer signal sent', { call_id: activeCallIdRef.current, chat_id: targetChatId });
      
	      if (componentMounted.current) {
	        setIsCalling(true);
	      }
        isCallingRef.current = true;
        isIncomingRingingRef.current = false;
        clearCallTimers();
      
      console.log('✅ [WebRTC] Answer sent successfully');
      return true;
	  } catch (error) {
	    console.warn('[CallAccept] failed stage=answer', { error: error instanceof Error ? error.message : String(error) });
      cleanupCall(fromUserId, { fromRemote: true, dispatchEvent: false });
      return false;
	  }
  }, [chatId, initLocalStream, createPeerConnection, createCallId, cleanupCall, flushPendingCandidates, clearCallTimers, queueIceCandidate, fetchIceConfiguration]);

  // ===== ПРИНЯТЬ ВХОДЯЩИЙ ЗВОНОК =====
  const acceptIncomingCall = useCallback(async (
    fromUserId: string,
    offer: RTCSessionDescriptionInit,
    callId?: string,
    initialCandidates: RTCIceCandidateInit[] = [],
    incomingChatId?: string,
  ) => {
    console.log('📞 [WebRTC] Accepting incoming call from:', fromUserId);
    const accepted = await answerCall(fromUserId, offer, callId, initialCandidates, incomingChatId);
    if (accepted && componentMounted.current) {
      setIncomingCall(null);
    }
    return accepted;
  }, [answerCall]);

  // ===== ЗАВЕРШИТЬ ЗВОНОК =====
  const endCall = useCallback((targetUserId: string, fromRemote: boolean = false, signalType: CallSignalType = 'end_call') => {
    console.log(`📞 [WebRTC] Ending call with: ${targetUserId}, fromRemote: ${fromRemote}, signalType: ${signalType}`);
    cleanupCall(targetUserId, {
      fromRemote,
      signalType: fromRemote ? undefined : signalType,
    });
  }, [cleanupCall]);

  // ===== ОБРАБОТЧИК ВЕБРТС СИГНАЛОВ =====
  useEffect(() => {
    const handleWebRTC = (data: any) => {
      const { sender_id, signal, signal_type, chat_id: signalChatId, call_id: callId } = data;
      console.info('[CallTrace] webrtc_received_client', { signal_type, sender_id, call_id: callId });
      
      // Игнорируем свои сигналы
      if (sender_id === currentUserIdRef.current) {
        console.log('⏭️ [WebRTC] Ignoring own signal');
        return false;
      }

      console.log(`📨 [WebRTC] Signal from ${sender_id}: ${signal_type}`);

      if (callId && activeCallIdRef.current && activeCallIdRef.current !== callId) {
        console.log(`⏭️ [WebRTC] Ignoring stale signal: ${signal_type}`);
        return;
      }

      // Обработка завершения/отмены звонка
      if (signal_type === 'end_call' || signal_type === 'cancel_call' || signal_type === 'decline_call' || signal_type === 'missed_call') {
        console.log(`📞 [WebRTC] Call terminal signal from ${sender_id}: ${signal_type}`);
        cleanupCall(sender_id, {
          fromRemote: true,
          signalType: signal_type === 'missed_call' ? 'missed_call' : undefined,
        });
        return;
      }

      // Обработка offer
      if (signal_type === 'offer') {
        if (!handleIncomingOffers) {
          return;
        }
        console.log(`📞 [WebRTC] OFFER from ${sender_id}`);
        console.info('[CallFlow] OFFER_RECEIVED', { call_id: callId, sender_id, target_user_id: currentUserIdRef.current });
        
        if (isCallActiveRef.current) {
          console.warn('⚠️ [WebRTC] Already in a call, ignoring offer');
          return;
        }
        if (incomingCallRef.current?.callId === callId) {
          console.warn('⚠️ [WebRTC] Duplicate offer ignored');
          return;
        }
        if (callId && activeCallIdRef.current === callId && isIncomingRingingRef.current) {
          console.warn('⚠️ [WebRTC] Duplicate ringing offer ignored');
          return;
        }
        activeCallIdRef.current = callId || activeCallIdRef.current || createCallId();
        activePeerIdRef.current = sender_id;
        activeChatIdRef.current = signalChatId || chatId;

        // Закрываем существующий пир
        const existing = peersRef.current.get(callPeerKey(callId, sender_id));
        if (existing) {
          // Duplicate offers for one call must not tear down the negotiation.
          console.warn('[WebRTC] Existing peer retained for duplicate offer', { call_id: callId, sender_id });
        }

        // Показываем модалку входящего звонка
        const userName = data.caller_name || data.caller_username || 'Пользователь';
        const userAvatar = data.caller_avatar || data.avatar;
        
        if (componentMounted.current) {
          setIncomingCall({
            from: sender_id,
            chatId: signalChatId,
            offer: signal,
            callId,
          });
        }
        try {
          localStorage.setItem('queenchat_pending_incoming_call', JSON.stringify({
            callId: activeCallIdRef.current,
            from: sender_id,
            callerName: userName,
            callerAvatar: userAvatar,
            chatId: signalChatId,
            callType: 'video',
            offer: signal,
            expiresAt: Date.now() + CLIENT_CALL_TIMEOUT_FALLBACK_MS,
          }));
        } catch {}
        isIncomingRingingRef.current = true;
        incomingTimeoutRef.current = window.setTimeout(() => {
          console.warn('⚠️ [WebRTC] Incoming call server-timeout fallback');
          cleanupCall(sender_id, { fromRemote: true, signalType: 'missed_call' });
        }, CLIENT_CALL_TIMEOUT_FALLBACK_MS);

        // Отправляем событие для App
        window.dispatchEvent(new CustomEvent('incoming_call', {
          detail: {
            caller_id: sender_id,
            chat_id: signalChatId,
            offer: signal,
            call_id: callId,
            name: userName,
            avatar: userAvatar,
          }
        }));
        console.info('[CallTrace] incoming_call_dispatched', { sender_id, chat_id: signalChatId, call_id: callId });
        showIncomingCallNotification(sender_id, callId, signalChatId);

        return;
      }

      // Обработка answer
      if (signal_type === 'answer') {
        console.log(`📨 [WebRTC] ANSWER from ${sender_id}`);
        console.info('[CallFlow] ANSWER_RECEIVED', { call_id: callId, sender_id, target_user_id: currentUserIdRef.current });
        const peerData = peersRef.current.get(callPeerKey(callId, sender_id));
        if (peerData) {
          if (peerData.peer.remoteDescription) {
            console.warn('⚠️ [WebRTC] Duplicate answer ignored');
            return;
          }
          peerData.peer.setRemoteDescription(new RTCSessionDescription(signal))
            .then(() => {
              console.log('✅ [WebRTC] Remote description set');
              return flushPendingCandidates(callId, sender_id, peerData.peer).then(() => {
                clearCallTimers();
              });
            })
            .catch((error) => console.error('❌ [WebRTC] Error setting remote description:', error));
        } else {
          console.warn(`⚠️ [WebRTC] No peer for answer from ${sender_id}`);
        }
        return;
      }

      // Обработка candidate
      if (signal_type === 'candidate') {
        console.info('[CallFlow] CANDIDATE_RECEIVED', { call_id: callId, sender_id, target_user_id: currentUserIdRef.current });
        const peerData = peersRef.current.get(callPeerKey(callId, sender_id));
        if (peerData) {
          if (!peerData.peer.remoteDescription) {
            queueIceCandidate(callId, sender_id, signal);
            return;
          }
          peerData.peer.addIceCandidate(new RTCIceCandidate(signal))
            .catch((error) => console.error('[WebRTC] Failed to add ICE candidate', error));
        } else {
          queueIceCandidate(callId, sender_id, signal);
        }
        return;
      }
    };

    // App.tsx exclusively owns the global socket lifecycle. This hook only
    // subscribes to signals; call/WebRTC state changes must not create a new
    // global connection or bypass its reconnect backoff.
    globalSocket.on('webrtc_signal', handleWebRTC);
    console.log('✅ [WebRTC] Listener attached');

    return () => {
      console.log('🔴 [WebRTC] Removing listener');
      globalSocket.off('webrtc_signal', handleWebRTC);
    };
  }, [
    chatId,
    cleanupCall,
    clearCallTimers,
    createCallId,
    flushPendingCandidates,
    queueIceCandidate,
    showIncomingCallNotification,
    listenAllIncoming,
    handleIncomingOffers,
  ]);

  // ===== ВОССТАНОВЛЕНИЕ ПРИ ПЕРЕПОДКЛЮЧЕНИИ =====
  useEffect(() => {
    const handleReconnect = () => {
      console.log('🔄 [WebRTC] Socket reconnected');
      peersRef.current.forEach((data, userId) => {
        if (data.peer.iceConnectionState === 'disconnected') {
          console.log(`🔄 [WebRTC] Restarting ICE for ${userId}`);
          data.peer.restartIce();
        }
      });
    };

    globalSocket.on('connect', handleReconnect);
    globalSocket.on('reconnect', handleReconnect);

    return () => {
      globalSocket.off('connect', handleReconnect);
      globalSocket.off('reconnect', handleReconnect);
    };
  }, []);

  useEffect(() => {
    const handlePageExit = () => {
      const peerId = activePeerIdRef.current;
      if (!peerId) return;

      const signalType: CallSignalType = isCallActiveRef.current
        ? 'end_call'
        : isIncomingRingingRef.current
          ? 'missed_call'
          : 'cancel_call';

      cleanupCall(peerId, { signalType, dispatchEvent: false });
    };

    window.addEventListener('pagehide', handlePageExit);
    window.addEventListener('beforeunload', handlePageExit);

    return () => {
      window.removeEventListener('pagehide', handlePageExit);
      window.removeEventListener('beforeunload', handlePageExit);
    };
  }, [cleanupCall]);

  // ===== ОЧИСТКА ПРИ РАЗМОНТИРОВАНИИ =====
  useEffect(() => {
    componentMounted.current = true;
    
    return () => {
      const peerId = activePeerIdRef.current;
      const signalType: CallSignalType | undefined = isCallActiveRef.current
        ? 'end_call'
        : isIncomingRingingRef.current
          ? 'missed_call'
          : isCallingRef.current
            ? 'cancel_call'
            : undefined;

      cleanupCall(peerId, { signalType, dispatchEvent: false });
      componentMounted.current = false;
    };
  }, [cleanupCall]);

  // ===== API =====
  return {
    localStream,
    remoteStream,
    isCallActive,
    isCalling,
    incomingCall,
    startCall,
    endCall,
    answerCall,
    acceptIncomingCall,
    initLocalStream,
  };
};
