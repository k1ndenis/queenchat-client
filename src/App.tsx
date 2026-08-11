import { BrowserRouter, Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { useAppDispatch, useAppSelector } from './lib/redux/hooks';
import { fetchMe, setUser } from './lib/redux/slices/userSlice';
import { currentSessionUserId, getCachedUser, setCachedUser } from './lib/cache';
import { useEffect, useRef, useState, useCallback } from 'react';
import Login from './components/Login';
import Register from './components/Register';
import ChatList from './components/ChatList';
import ChatRoom from './components/ChatRoom';
import LoadingScreen from './components/LoadingScreen';
import Logo from './components/Logo';
import Profile from './components/Profile';
import Settings from './components/Settings';
import UserProfile from './components/UserProfile';
import IncomingCallModal from './components/IncomingCallModal';
import VideoCallModal from './components/VideoCallModal';
import Admin from './components/Admin';
import { requestFCMToken, onFCMListener, updateServiceWorkerState } from './lib/firebase';
import { savePendingIncomingCall } from './lib/firebase';
import { chatSocket, globalSocket } from './lib/socket';
import { fetchWithAuth } from './lib/api';
import { clearPendingNativeCallAction, getPendingNativeCallAction } from './lib/native';
import { translations } from './lib/locales';
import { useVideoCall } from './hooks/useVideoCall';

type GlobalIncomingCall = {
  from: string;
  chatId: string;
  name: string;
  avatar?: string;
  callerUsername?: string;
  offer?: RTCSessionDescriptionInit;
  initialCandidates?: RTCIceCandidateInit[];
  callId?: string;
  expiresAt?: number;
};

type PendingGlobalIncomingCall = GlobalIncomingCall & {
  callId: string;
  callerName?: string;
  callType: string;
  expiresAt: number;
};

function Home() {
  const navigate = useNavigate();
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="mb-8">
          <Logo variant="full" />
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-white text-center mb-4 tracking-tight">
          QueenChat
        </h1>
        <p className="text-base md:text-lg lg:text-xl text-purple-200 text-center max-w-md mb-12 px-4">
          {t.homeSubtitle}
        </p>
        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={() => navigate('/login')}
            className="px-6 py-2.5 md:px-8 md:py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105 text-center cursor-pointer"
          >
            {t.homeLogin}
          </button>
          <button
            onClick={() => navigate('/register')}
            className="px-6 py-2.5 md:px-8 md:py-3 bg-white/10 backdrop-blur-sm border border-white/20 text-white font-semibold rounded-xl hover:bg-white/20 transition-all duration-300 hover:scale-105 text-center cursor-pointer"
          >
            {t.homeRegister}
          </button>
        </div>
        <p className="mt-12 text-purple-300/50 text-xs md:text-sm">
          {t.homeFeatures}
        </p>
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading, language } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const hasFetched = useRef(false);
  const fcmInitialized = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneGainRef = useRef<GainNode | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);
  const ringtoneUnlockedRef = useRef(false);
  const retryRingtoneAfterUnlockRef = useRef(false);
  const [incomingCallData, setIncomingCallData] = useState<GlobalIncomingCall | null>(null);
  const incomingCallDataRef = useRef<GlobalIncomingCall | null>(null);
  const processedNativeAccepts = useRef(new Set<string>());
  const pendingNativeActionProcessingRef = useRef<Promise<void> | null>(null);
  const globalSocketUserIdRef = useRef<string | null>(null);

  const {
    isCallModalOpen,
    targetUser,
    localStream,
    remoteStream,
    isCallActive,
    isCalling,
    startCall,
    endCall,
    handleCloseModal,
    openCallModal,
    acceptIncomingCall,
    initLocalStream,
  } = useVideoCall({
    chatId: '',
    currentUserId: user?.id || '',
    listenAllIncoming: true,
    handleIncomingOffers: true,
    onCallEnd: () => {
      setIncomingCallData(null);
    },
  });

  // The App-level hook owns the PeerConnection, so changing ChatRoom routes
  // cannot close or recreate an in-flight call.
  useEffect(() => {
    const startGlobalCall = async (event: Event) => {
      const { userId, userName, userAvatar, chatId } = (event as CustomEvent).detail || {};
      if (!userId || !chatId) return;
      try {
        await initLocalStream();
        openCallModal(userId, userName, userAvatar);
        await startCall(userId, chatId);
      } catch (error) {
        console.error('[CallFlow] global call start failed', { message: error instanceof Error ? error.message : String(error) });
        handleCloseModal();
      }
    };
    window.addEventListener('queenchat_start_call', startGlobalCall);
    return () => window.removeEventListener('queenchat_start_call', startGlobalCall);
  }, [initLocalStream, openCallModal, startCall, handleCloseModal]);

  useEffect(() => {
    incomingCallDataRef.current = incomingCallData;
  }, [incomingCallData]);

  const getAudioContext = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current;
    const AudioContextCtor = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      console.warn('[Ringtone] Web Audio API is not supported');
      return null;
    }
    audioContextRef.current = new AudioContextCtor();
    console.log('[Ringtone] Web Audio context created');
    return audioContextRef.current;
  }, []);

  const stopIncomingRingtone = useCallback(() => {
    try {
      if (ringtoneIntervalRef.current) {
        window.clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
      if (ringtoneGainRef.current) {
        ringtoneGainRef.current.disconnect();
      }
    } catch (error) {
      console.warn('⚠️ [App] Failed to stop ringtone:', error);
    } finally {
      ringtoneGainRef.current = null;
    }
  }, []);

  const playIncomingRingtone = useCallback(() => {
    const context = getAudioContext();
    if (!context) return;

    context.resume()
      .then(() => {
        stopIncomingRingtone();
        const gain = context.createGain();
        gain.gain.value = 0.08;
        gain.connect(context.destination);
        ringtoneGainRef.current = gain;

        const playBeep = () => {
          const now = context.currentTime;
          const first = context.createOscillator();
          const second = context.createOscillator();
          first.type = 'sine';
          second.type = 'sine';
          first.frequency.setValueAtTime(880, now);
          second.frequency.setValueAtTime(660, now + 0.22);
          first.connect(gain);
          second.connect(gain);
          first.start(now);
          first.stop(now + 0.18);
          second.start(now + 0.22);
          second.stop(now + 0.42);
        };

        playBeep();
        ringtoneIntervalRef.current = window.setInterval(playBeep, 1100);
        retryRingtoneAfterUnlockRef.current = false;
        console.log('[Ringtone] Web Audio ringtone started');
      })
      .catch((error) => {
        retryRingtoneAfterUnlockRef.current = true;
        console.warn('[Ringtone] Web Audio ringtone start failed:', {
          name: error?.name,
          message: error?.message || String(error),
        });
      });
  }, [getAudioContext, stopIncomingRingtone]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const listener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack && window.history.length > 1) {
        navigate(-1);
        return;
      }
      CapacitorApp.minimizeApp();
    });

    return () => {
      listener.then(handle => handle.remove()).catch(() => {});
    };
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    const unlockRingtone = () => {
      if (ringtoneUnlockedRef.current) return;
      const context = getAudioContext();
      if (!context) return;
      context.resume()
        .then(() => {
          ringtoneUnlockedRef.current = true;
          console.log('[Ringtone] Web Audio unlocked by user gesture');

          if (retryRingtoneAfterUnlockRef.current && incomingCallDataRef.current) {
            playIncomingRingtone();
          }
        })
        .catch((error) => {
          console.warn('[Ringtone] Web Audio unlock failed:', {
            name: error?.name,
            message: error?.message || String(error),
          });
        });
    };

    window.addEventListener('pointerdown', unlockRingtone, { once: true });
    window.addEventListener('keydown', unlockRingtone, { once: true });
    window.addEventListener('touchstart', unlockRingtone, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockRingtone);
      window.removeEventListener('keydown', unlockRingtone);
      window.removeEventListener('touchstart', unlockRingtone);
    };
  }, [user, getAudioContext, playIncomingRingtone]);

  useEffect(() => {
    if (!incomingCallData) {
      stopIncomingRingtone();
      return;
    }

    console.log('[Ringtone] Web Audio ringtone requested');
    playIncomingRingtone();

    return stopIncomingRingtone;
  }, [incomingCallData, stopIncomingRingtone, playIncomingRingtone]);

  const showGlobalIncomingCall = useCallback((call: {
    from?: string;
    caller_id?: string;
    chatId?: string;
    chat_id?: string;
    callerName?: string;
    callerUsername?: string;
    name?: string;
    avatar?: string;
    callerAvatar?: string;
    offer?: RTCSessionDescriptionInit;
    initialCandidates?: RTCIceCandidateInit[];
    callId?: string;
    call_id?: string;
    expiresAt?: number;
  }) => {
    if (!user) return;
    const from = call.from || call.caller_id;
    const chatId = call.chatId || call.chat_id;
    const callId = call.callId || call.call_id;
    if (!from || !chatId || from === user.id) return;
    if (call.expiresAt && Number(call.expiresAt) < Date.now()) {
      localStorage.removeItem('queenchat_pending_incoming_call');
      return;
    }
    setIncomingCallData((current) => {
      if (current?.callId && callId && current.callId === callId) return current;
      console.info('[CallTrace] incoming_modal_set', { sender_id: from, chat_id: chatId, call_id: callId });
      return {
        from,
        chatId,
        name: call.callerName?.trim() || call.name?.trim() || call.callerUsername?.trim() || t.callerUnknown,
        avatar: call.avatar || call.callerAvatar,
        offer: call.offer,
        initialCandidates: call.initialCandidates,
        callId,
        expiresAt: call.expiresAt,
      };
    });
    localStorage.removeItem('queenchat_pending_incoming_call');
  }, [user, t.callerUnknown]);

  const sendDeclineCallSignal = useCallback(async (call: {
    from: string;
    chatId: string;
    callId?: string;
  }) => {
    stopIncomingRingtone();
    setIncomingCallData(null);
    localStorage.removeItem('queenchat_pending_incoming_call');

    if (!chatSocket.isConnected()) {
      await chatSocket.connectToChat(call.chatId);
    }

    await chatSocket.emit('webrtc', {
      target_user_id: call.from,
      signal_type: 'decline_call',
      signal: {},
      chat_id: call.chatId,
      call_id: call.callId,
    });
  }, [stopIncomingRingtone]);

  const restorePendingCall = useCallback(async (chatId: string, callId: string, fallback?: {
    callerId?: string;
    callerName?: string;
    callerAvatar?: string;
  }): Promise<GlobalIncomingCall> => {
    console.info('[CallResume] connectToChat started', { chatId, callId });
    await chatSocket.connectToChat(chatId);
    console.info('[CallResume] chat socket open', { chatId, callId });
    await chatSocket.ensureConnectedAndAlive();
    console.info('[CallResume] ping/pong ok', { chatId, callId });

    const response = await fetchWithAuth(`/chats/${chatId}/calls/${callId}/pending`);
    if (!response.ok) throw new Error(`Pending call is unavailable (${response.status})`);
    const call = await response.json();
    if (!call.offer) throw new Error('Pending call has no offer');
    const callerId = call.caller_id || fallback?.callerId;
    if (!callerId) throw new Error('Pending call has no caller');
    const callerName = call.caller_name?.trim()
      || call.caller_username?.trim()
      || fallback?.callerName?.trim()
      || t.callerUnknown;
    console.info('[CallResume] incoming call restored', {
      callId,
      chatId,
      offer_available: true,
      candidates: Array.isArray(call.candidates) ? call.candidates.length : 0,
    });
    return {
      from: callerId,
      chatId,
      name: callerName,
      avatar: call.caller_avatar || fallback?.callerAvatar,
      offer: call.offer,
      initialCandidates: Array.isArray(call.candidates) ? call.candidates : [],
      callId,
      expiresAt: Date.now() + 30000,
    };
  }, [t.callerUnknown]);

  const processPendingNativeCallAction = useCallback((trigger: string) => {
    if (!user || !Capacitor.isNativePlatform()) return Promise.resolve();
    if (pendingNativeActionProcessingRef.current) return pendingNativeActionProcessingRef.current;

    const task = (async () => {
      console.info('[CallResume] lifecycle trigger', { trigger });
      const pending = await getPendingNativeCallAction();
      if (!pending || pending.action !== 'accept_call') return;
      const { call_id: callId, chat_id: chatId, caller_id: callerId } = pending;
      if (!callId || !chatId || !callerId || processedNativeAccepts.current.has(callId)) return;

      try {
        console.info('[CallResume] pending accept found', { callId, chatId });
        console.info('[CallResume] auth ready', { userId: user.id });
        navigate(`/chat/${chatId}`);
        const call = await restorePendingCall(chatId, callId, {
          callerId,
          callerName: pending.caller_name,
          callerAvatar: pending.caller_avatar,
        });
        console.info('[CallResume] accept started', { callId });
        const accepted = await acceptIncomingCall(
          call.from,
          call.offer!,
          call.callId,
          call.initialCandidates || [],
          call.chatId,
        );
        if (!accepted) throw new Error('WebRTC answer was not sent');
        openCallModal(call.from, call.name, call.avatar);
        processedNativeAccepts.current.add(callId);
        await clearPendingNativeCallAction();
        localStorage.removeItem('queenchat_pending_incoming_call');
        console.info('[CallResume] accept success', { callId });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn('[CallResume] accept failure', { callId, error: message });
        // Keep a native action for retry on transient network/WebView errors;
        // terminal calls can no longer be accepted and must be acknowledged.
        if (/\((404|410)\)|no offer|no caller/i.test(message)) {
          await clearPendingNativeCallAction();
        }
      }
    })();
    pendingNativeActionProcessingRef.current = task.finally(() => {
      pendingNativeActionProcessingRef.current = null;
    });
    return pendingNativeActionProcessingRef.current;
  }, [user, navigate, restorePendingCall, acceptIncomingCall, openCallModal]);

  // ===== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЯ =====
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      const cachedUserId = currentSessionUserId();
      if (cachedUserId) {
        getCachedUser(cachedUserId).then(cachedUser => {
          if (cachedUser) dispatch(setUser(cachedUser));
        }).finally(() => dispatch(fetchMe()));
      } else {
        dispatch(fetchMe());
      }
    }
  }, [dispatch]);

  useEffect(() => {
    if (user) void setCachedUser(user);
  }, [user]);

  // ===== ПОДКЛЮЧЕНИЕ ГЛОБАЛЬНОГО СОКЕТА =====
  // This lifecycle deliberately depends only on the stable user id. Do not put
  // call state, route, or the whole user object here: those updates must never
  // tear down or re-create the global incoming-call channel.
  useEffect(() => {
    if (user?.id) {
      if (globalSocketUserIdRef.current && globalSocketUserIdRef.current !== user.id) {
        globalSocket.disconnect('user_change');
      }
      globalSocketUserIdRef.current = user.id;
      console.log('🔴 [APP] Connecting to WebSocket...');
      void globalSocket.connect('authenticated_user').then(() => {
        console.info('[SocketTrace] global_ws_connected', { user_id: user.id });
      }).catch(error => {
        console.warn('[SocketTrace] global_connect_failed', {
          user_id: user.id,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    } else {
      globalSocketUserIdRef.current = null;
      globalSocket.disconnect('logout');
    }
  }, [user?.id]);

  useEffect(() => () => {
    globalSocket.disconnect('app_unmount');
  }, []);

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      console.info('[WSHealth] Capacitor resume: verifying sockets');
      void globalSocket.ensureConnectedAndAlive().catch(error => console.warn('[WSHealth] global resume check failed', error));
      if (chatSocket.hasTarget()) {
        void chatSocket.ensureConnectedAndAlive().catch(error => console.warn('[WSHealth] chat resume check failed', error));
      }
      void processPendingNativeCallAction('appStateChange');
    });
    return () => { void listener.then(handle => handle.remove()); };
  }, [user, processPendingNativeCallAction]);

  useEffect(() => {
    if (!user) return;
    void processPendingNativeCallAction('startup');
  }, [user, processPendingNativeCallAction]);

  useEffect(() => {
    if (!user || !Capacitor.isNativePlatform()) return;
    const handleNativeUrl = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (url?.includes('incoming_call=1')) {
        void processPendingNativeCallAction('appUrlOpen');
      }
    };
    window.addEventListener('native_app_url_open', handleNativeUrl);
    return () => window.removeEventListener('native_app_url_open', handleNativeUrl);
  }, [user, processPendingNativeCallAction]);

  // ===== FCM =====
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let mounted = true;

    const initFCM = async () => {
      if (!user) {
        console.log('[FCM Debug] init skipped: no user');
        return;
      }
      if (fcmInitialized.current) {
        console.log('[FCM Debug] init skipped: already initialized', { user_id: user.id });
        return;
      }
      fcmInitialized.current = true;
      try {
        console.log('[FCM Debug] requestFCMToken called', { user_id: user.id });
        const token = await requestFCMToken();
        console.log('[FCM Debug] requestFCMToken result', {
          user_id: user.id,
          has_token: !!token,
          token_len: token?.length || 0,
        });
        if (mounted) {
          unsubscribe = onFCMListener();
          console.log('[FCM Debug] foreground listener attached', { user_id: user.id });
        }
      } catch (e) {
        console.error('FCM init error:', e);
      }
    };
    initFCM();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const syncState = () => updateServiceWorkerState();
    syncState();

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'QUEENCHAT_OPEN_NOTIFICATION' && event.data.url) {
        let pendingIncomingCall: PendingGlobalIncomingCall | null = null;
        if (event.data.eventType === 'incoming_call' && event.data.callId && event.data.callerId && event.data.chatId) {
          pendingIncomingCall = {
            callId: event.data.callId,
            from: event.data.callerId,
            callerName: event.data.callerName,
            name: event.data.callerName || t.callerUnknown,
            chatId: event.data.chatId,
            callType: event.data.callType || 'video',
            expiresAt: Date.now() + 35000,
          };
          savePendingIncomingCall(pendingIncomingCall);
        }

        if (event.data.callAction === 'decline_call' && pendingIncomingCall) {
          void sendDeclineCallSignal(pendingIncomingCall);
          return;
        }

        navigate(event.data.url);
      }
    };

    const params = new URLSearchParams(location.search);
    if (params.get('incoming_call') === '1') {
      const callId = params.get('call_id');
      const callerId = params.get('caller_id');
      const chatId = location.pathname.match(/^\/chat\/([^/?#]+)/)?.[1];
      if (callId && callerId && chatId) {
        const pendingIncomingCall: PendingGlobalIncomingCall = {
          callId,
          from: callerId,
          callerName: params.get('caller_name') || undefined,
          name: params.get('caller_name') || t.callerUnknown,
          chatId: decodeURIComponent(chatId),
          callType: params.get('call_type') || 'video',
          expiresAt: Date.now() + 35000,
        };
        const callAction = params.get('call_action');
        if (callAction === 'decline_call') {
          void sendDeclineCallSignal(pendingIncomingCall);
        } else if (callAction === 'accept_call') {
          void processPendingNativeCallAction('appUrlOpen');
        } else {
          // A notification body only opens the call.  Restore the same
          // server-side offer/ICE snapshot used by native Accept before
          // presenting the in-app accept button.
          void restorePendingCall(decodeURIComponent(chatId), callId, {
            callerId,
            callerName: pendingIncomingCall.callerName,
          }).then(showGlobalIncomingCall).catch(error => {
            console.warn('[CallResume] open_call restore failed', {
              callId,
              error: error instanceof Error ? error.message : String(error),
            });
            // Preserve a usable modal; its Accept handler will retry restore.
            showGlobalIncomingCall(pendingIncomingCall);
          });
        }
      }
    }

    document.addEventListener('visibilitychange', syncState);
    window.addEventListener('focus', syncState);
    window.addEventListener('blur', syncState);
    navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage);

    return () => {
      document.removeEventListener('visibilitychange', syncState);
      window.removeEventListener('focus', syncState);
      window.removeEventListener('blur', syncState);
      navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage);
    };
  }, [user, location.pathname, location.search, navigate, sendDeclineCallSignal, t.callerUnknown, processPendingNativeCallAction, restorePendingCall, showGlobalIncomingCall]);

  // ===== ГЛОБАЛЬНАЯ ОБРАБОТКА ВХОДЯЩИХ ЗВОНКОВ =====
  useEffect(() => {
    if (!user) return;

    const handleIncomingCall = (event: Event) => {
      const call = (event as CustomEvent).detail;
      if (call) {
        console.info('[CallTrace] incoming_call_received', {
          sender_id: call.caller_id || call.from,
          call_id: call.call_id || call.callId,
        });
        showGlobalIncomingCall(call);
      }
    };

    const handlePendingIncomingCall = (event: Event) => {
      const call = (event as CustomEvent).detail;
      if (call) showGlobalIncomingCall(call);
    };

    window.addEventListener('incoming_call', handleIncomingCall);
    window.addEventListener('pending_incoming_call_updated', handlePendingIncomingCall);

    const raw = localStorage.getItem('queenchat_pending_incoming_call');
    if (raw) {
      try {
        showGlobalIncomingCall(JSON.parse(raw));
      } catch {
        localStorage.removeItem('queenchat_pending_incoming_call');
      }
    }

    return () => {
      window.removeEventListener('incoming_call', handleIncomingCall);
      window.removeEventListener('pending_incoming_call_updated', handlePendingIncomingCall);
    };
  }, [user, showGlobalIncomingCall]);

  useEffect(() => {
    const cleanupIncomingCall = () => {
      stopIncomingRingtone();
      setIncomingCallData(null);
    };

    window.addEventListener('call_ended', cleanupIncomingCall);
    window.addEventListener('call_missed', cleanupIncomingCall);

    return () => {
      window.removeEventListener('call_ended', cleanupIncomingCall);
      window.removeEventListener('call_missed', cleanupIncomingCall);
    };
  }, [stopIncomingRingtone]);

  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCallData) return;

    let call = incomingCallData;
    console.info('[CallAccept] clicked', {
      call_id: call.callId,
      caller_id: call.from,
      chat_id: call.chatId,
      offer_available: Boolean(call.offer),
      candidates: call.initialCandidates?.length || 0,
    });

    try {
      if (!call.offer) {
        if (!call.callId) throw new Error('Incoming call has no call id');
        call = await restorePendingCall(call.chatId, call.callId, {
          callerId: call.from,
          callerName: call.name,
          callerAvatar: call.avatar,
        });
        setIncomingCallData(call);
      }

      const accepted = await acceptIncomingCall(
        call.from,
        call.offer!,
        call.callId,
        call.initialCandidates || [],
        call.chatId,
      );
      if (!accepted) throw new Error('WebRTC answer was not sent');

      stopIncomingRingtone();
      setIncomingCallData(null);
      openCallModal(call.from, call.name, call.avatar);
      console.info('[CallAccept] accept success', { call_id: call.callId, chat_id: call.chatId });
    } catch (error) {
      console.warn('[CallAccept] failed stage=accept', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Do not dismiss the incoming modal on failure: the user can retry or
      // decline instead of seeing a false "accepted" state.
    }
  }, [incomingCallData, restorePendingCall, acceptIncomingCall, stopIncomingRingtone, openCallModal]);

  const handleDeclineIncomingCall = useCallback(async () => {
    if (!incomingCallData) return;

    const { from, chatId, callId, offer } = incomingCallData;
    stopIncomingRingtone();
    setIncomingCallData(null);

    if (offer) {
      endCall(from, false, 'decline_call');
      return;
    }

    await sendDeclineCallSignal({ from, chatId, callId });
  }, [incomingCallData, stopIncomingRingtone, endCall, sendDeclineCallSignal]);

  if (loading) {
    return <LoadingScreen />;
  }

  const isPublicPage = location.pathname === '/' || 
                       location.pathname === '/login' || 
                       location.pathname === '/register' ||
                       location.pathname.startsWith('/user/');

  if (!user && !isPublicPage) {
    return <Navigate to="/login" replace />;
  }

  if (user && (location.pathname === '/' || location.pathname === '/login' || location.pathname === '/register')) {
    return <Navigate to="/chat" replace />;
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/chat" element={<ChatList />} />
        <Route path="/chat/:id" element={<ChatRoom />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/user/:username" element={<UserProfile />} />
      </Routes>
      <IncomingCallModal
        isOpen={!!incomingCallData}
        callerName={incomingCallData?.name || ''}
        callerAvatar={incomingCallData?.avatar}
        onAccept={handleAcceptIncomingCall}
        onDecline={handleDeclineIncomingCall}
      />
      <VideoCallModal
        isOpen={isCallModalOpen}
        localStream={localStream}
        remoteStream={remoteStream}
        isCallActive={isCallActive}
        isCalling={isCalling}
        targetUserName={targetUser?.name}
        targetUserAvatar={targetUser?.avatar}
        onEndCall={() => {
          if (targetUser) {
            endCall(targetUser.id, false, isCalling && !isCallActive ? 'cancel_call' : 'end_call');
          }
          handleCloseModal();
        }}
        onClose={() => {
          if ((isCallActive || isCalling) && targetUser) {
            endCall(targetUser.id, false, isCalling && !isCallActive ? 'cancel_call' : 'end_call');
          }
          handleCloseModal();
        }}
      />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
