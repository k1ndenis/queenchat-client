import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';

interface VideoCallModalProps {
  isOpen: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isCallActive: boolean;
  isCalling: boolean;
  targetUserName?: string;
  targetUserAvatar?: string;
  onEndCall: () => void;
  onClose: () => void;
}

export default function VideoCallModal({
  isOpen,
  localStream,
  remoteStream,
  isCallActive,
  isCalling,
  targetUserName,
  targetUserAvatar,
  onEndCall,
  onClose,
}: VideoCallModalProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [primaryVideo, setPrimaryVideo] = useState<'remote' | 'local'>('remote');
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];
  
  // ===== ДЕТАЛЬНАЯ ДИАГНОСТИКА ПРИ ОТКРЫТИИ =====
  useEffect(() => {
    if (!isOpen) return;
    
    console.log('🔴🔴🔴 [VideoCallModal] ===== DIAGNOSTIC START =====');
    console.log('📹 isOpen:', isOpen);
    console.log('📹 localStream:', localStream);
    console.log('📹 remoteStream:', remoteStream);
    console.log('📹 isCallActive:', isCallActive);
    console.log('📹 isCalling:', isCalling);
    console.log('📹 targetUserName:', targetUserName);
    
    if (localStream) {
      console.log('📹 LOCAL stream tracks:', localStream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        id: t.id
      })));
    } else {
      console.warn('⚠️ LOCAL stream is NULL!');
    }
    
    if (remoteStream) {
      console.log('📹 REMOTE stream tracks:', remoteStream.getTracks().map(t => ({
        kind: t.kind,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        id: t.id
      })));
    } else {
      console.warn('⚠️ REMOTE stream is NULL!');
    }
    
    console.log('🔴🔴🔴 [VideoCallModal] ===== DIAGNOSTIC END =====');
  }, [isOpen, localStream, remoteStream, isCallActive, isCalling, targetUserName]);

  // ===== ДИАГНОСТИКА ИЗМЕНЕНИЙ remoteStream =====
  useEffect(() => {
    console.log('🔄 [VideoCallModal] remoteStream CHANGED:', {
      hasRemote: !!remoteStream,
      active: remoteStream?.active,
      tracks: remoteStream?.getTracks().map(t => t.kind),
      isOpen
    });
    
    if (remoteStream && !remoteStream.active) {
      console.warn('⚠️ remoteStream is NOT active!');
    }
  }, [remoteStream, isOpen]);

  // ===== ДИАГНОСТИКА ИЗМЕНЕНИЙ localStream =====
  useEffect(() => {
    console.log('🔄 [VideoCallModal] localStream CHANGED:', {
      hasLocal: !!localStream,
      active: localStream?.active,
      tracks: localStream?.getTracks().map(t => t.kind),
      isOpen
    });
  }, [localStream, isOpen]);

  // ===== ЛОКАЛЬНОЕ ВИДЕО =====
  useEffect(() => {
    const video = localVideoRef.current;
    if (!video) {
      console.warn('⚠️ [VideoCallModal] localVideoRef is NULL');
      return;
    }
    
    console.log('📹 [VideoCallModal] Setting LOCAL video, isOpen:', isOpen, 'hasStream:', !!localStream);

    if (localStream) {
      console.log('📹 [VideoCallModal] Setting LOCAL video srcObject');
      video.srcObject = localStream;
      video.muted = true;
      video.playsInline = true;
      
      video.play()
        .then(() => console.log('✅ [VideoCallModal] Local video playing'))
        .catch((e) => console.warn('⚠️ [VideoCallModal] Local play blocked:', e));
    } else {
      console.log('📹 [VideoCallModal] Clearing LOCAL video');
      video.srcObject = null;
    }
  }, [localStream, isOpen]);

  // ===== УДАЛЕННОЕ ВИДЕО =====
  useEffect(() => {
    const video = remoteVideoRef.current;
    if (!video) {
      console.warn('⚠️ [VideoCallModal] remoteVideoRef is NULL');
      return;
    }
    
    console.log('📹 [VideoCallModal] Setting REMOTE video, isOpen:', isOpen, 'hasStream:', !!remoteStream);

    if (remoteStream) {
      console.log('📹 [VideoCallModal] Setting REMOTE video srcObject');
      console.log('📹 Remote tracks:', remoteStream.getTracks().map(t => t.kind));
      console.log('📹 Remote stream active:', remoteStream.active);
      
      video.srcObject = remoteStream;
      video.muted = false;
      video.playsInline = true;
      
      // Проверяем, что srcObject установлен
      console.log('📹 video.srcObject after setting:', video.srcObject);
      
      video.play()
        .then(() => console.log('✅ [VideoCallModal] Remote video playing'))
        .catch((e) => {
          console.warn('⚠️ [VideoCallModal] Remote play blocked:', e);
          setTimeout(() => {
            console.log('🔄 [VideoCallModal] Retrying remote play...');
            video.play()
              .then(() => console.log('✅ [VideoCallModal] Remote video playing on retry'))
              .catch(err => console.error('❌ [VideoCallModal] Remote retry failed:', err));
          }, 500);
        });
    } else {
      console.log('📹 [VideoCallModal] Clearing REMOTE video');
      video.srcObject = null;
    }
  }, [remoteStream, isOpen]);

  // ===== ПРОВЕРКА СОСТОЯНИЯ ВИДЕО ЭЛЕМЕНТОВ =====
  useEffect(() => {
    if (!isOpen) return;

    const checkVideoState = () => {
      const remoteVideo = remoteVideoRef.current;
      const localVideo = localVideoRef.current;
      
      if (remoteVideo) {
        console.log('📹 Remote video state:', {
          srcObject: remoteVideo.srcObject ? 'Has stream' : 'NULL',
          readyState: remoteVideo.readyState,
          paused: remoteVideo.paused,
          ended: remoteVideo.ended,
          videoWidth: remoteVideo.videoWidth,
          videoHeight: remoteVideo.videoHeight,
          error: remoteVideo.error
        });
      }
      
      if (localVideo) {
        console.log('📹 Local video state:', {
          srcObject: localVideo.srcObject ? 'Has stream' : 'NULL',
          readyState: localVideo.readyState,
          paused: localVideo.paused,
          ended: localVideo.ended,
          videoWidth: localVideo.videoWidth,
          videoHeight: localVideo.videoHeight
        });
      }
    };

    // Проверяем сразу
    checkVideoState();
    
    // И через 2 секунды
    const timer = setTimeout(checkVideoState, 2000);
    
    return () => clearTimeout(timer);
  }, [isOpen, remoteStream, localStream]);

  // ===== ПРИНУДИТЕЛЬНОЕ ОБНОВЛЕНИЕ =====
  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      const remoteVideo = remoteVideoRef.current;
      const localVideo = localVideoRef.current;

      // Проверяем remote video
      if (remoteVideo && remoteStream) {
        if (remoteVideo.srcObject !== remoteStream) {
          console.log('🔄 [VideoCallModal] Force updating remote video');
          remoteVideo.srcObject = remoteStream;
          remoteVideo.play().catch(() => {});
        }
        // Проверяем, есть ли видео данные
        if (remoteVideo.videoWidth === 0 && remoteVideo.videoHeight === 0) {
          console.warn('⚠️ [VideoCallModal] Remote video has no dimensions (0x0)');
        }
      }

      // Проверяем local video
      if (localVideo && localStream) {
        if (localVideo.srcObject !== localStream) {
          console.log('🔄 [VideoCallModal] Force updating local video');
          localVideo.srcObject = localStream;
          localVideo.play().catch(() => {});
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, remoteStream, localStream]);

  // ===== ОЧИСТКА ПРИ ЗАКРЫТИИ =====
  useEffect(() => {
    if (!isOpen) {
      console.log('📹 [VideoCallModal] Closing, cleaning up');
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
        localVideoRef.current.pause();
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
        remoteVideoRef.current.pause();
      }
    }
  }, [isOpen]);

  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      const newVideoState = !isVideoOff;
      videoTracks.forEach(track => {
        track.enabled = !newVideoState;
      });
      setIsVideoOff(newVideoState);
    }
  };

  if (!isOpen) return null;

  const hasRemote = !!remoteStream;
  const hasLocal = !!localStream;
  const showCalling = isCalling && !isCallActive && !hasRemote;
  const localIsPrimary = primaryVideo === 'local';
  const swapVideos = () => {
    if (hasRemote && hasLocal) setPrimaryVideo(current => current === 'local' ? 'remote' : 'local');
  };

  return (
    <div className="call-modal fixed inset-0 bg-black/95 backdrop-blur-lg flex items-center justify-center z-[9999]">
      <div className="call-modal-shell relative w-full h-full flex flex-col">
        {/* Кнопка закрытия */}
        <button
          onClick={onClose}
          className="call-close absolute z-30 w-10 h-10 bg-white/10 rounded-full hover:bg-white/20 transition flex items-center justify-center text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* ОСНОВНОЙ КОНТЕНТ */}
        <div className="flex-1 relative bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 overflow-hidden">
          
          {/* ===== СОСТОЯНИЕ: ЗВОНИМ ===== */}
          {showCalling && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="relative">
                <Avatar
                  userId={targetUserName}
                  name={targetUserName}
                  size="xl"
                  src={targetUserAvatar}
                />
                <div className="absolute -bottom-2 -right-2 w-4 h-4 bg-green-500 rounded-full animate-pulse" />
              </div>
              <h2 className="text-2xl font-semibold text-white mt-6">{targetUserName || t.callerUnknown}</h2>
              <p className="text-purple-300 mt-2">{t.callCalling}</p>
              <div className="flex gap-2 mt-8">
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {/* Both video elements stay mounted while swapping: only their visual layout changes. */}
          {!showCalling && (
            <>
              <div className={`call-video-stage ${localIsPrimary ? 'call-video-secondary' : 'call-video-primary'}`}>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="call-video-element"
                />
                {!hasRemote && (
                  <div className="call-video-placeholder flex items-center justify-center bg-gradient-to-br from-slate-900 to-purple-900">
                  <div className="text-center">
                    <Avatar
                      userId={targetUserName}
                      name={targetUserName}
                      size="xl"
                      src={targetUserAvatar}
                    />
                    <h2 className="text-2xl font-semibold text-white mt-4">{targetUserName || t.callerUnknown}</h2>
                    <p className="text-purple-300 mt-2">{t.callConnecting}</p>
                  </div>
                </div>
                )}
              </div>

              <button
                type="button"
                onClick={swapVideos}
                disabled={!hasRemote || !hasLocal}
                aria-label={localIsPrimary ? 'Показать собеседника основным видео' : 'Показать своё видео основным'}
                title="Поменять видео местами"
                className={`call-video-stage call-local-video ${localIsPrimary ? 'call-video-primary' : 'call-video-secondary'}`}
              >
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="call-video-element call-local-video-element"
                />
                {(!hasLocal || isVideoOff) && (
                  <div className="call-video-placeholder flex flex-col items-center justify-center bg-gradient-to-br from-purple-900 to-slate-800">
                    <div className="w-16 h-16 rounded-full bg-purple-500/30 flex items-center justify-center">
                      <span className="text-3xl text-white font-semibold">
                        {targetUserName ? targetUserName.charAt(0).toUpperCase() : '?'}
                      </span>
                    </div>
                    <span className="text-white text-xs mt-2">{t.callMe}</span>
                  </div>
                )}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 rounded-full text-white text-xs">
                  {isMuted ? '🔇' : '🎤'}
                </div>
              </button>
            </>
          )}
        </div>

        {/* ПАНЕЛЬ УПРАВЛЕНИЯ */}
        <div className="call-controls bg-black/60 backdrop-blur-lg border-t border-white/10 py-4 px-6 flex-shrink-0 z-20">
          <div className="max-w-md mx-auto flex items-center justify-center gap-4 md:gap-6">
            <button
              onClick={toggleMute}
              className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition ${
                isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'
              }`}
              title={isMuted ? t.enableMicrophone : t.disableMicrophone}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                {isMuted ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </>
                ) : (
                  <>
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                    <line x1="12" y1="19" x2="12" y2="23"/>
                    <line x1="8" y1="23" x2="16" y2="23"/>
                  </>
                )}
              </svg>
            </button>

            <button
              onClick={toggleVideo}
              className={`w-12 h-12 md:w-14 md:h-14 rounded-full flex items-center justify-center transition ${
                isVideoOff ? 'bg-red-500 hover:bg-red-600' : 'bg-white/10 hover:bg-white/20'
              }`}
              title={isVideoOff ? t.enableCamera : t.disableCamera}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                {isVideoOff ? (
                  <>
                    <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </>
                ) : (
                  <>
                    <rect x="2" y="5" width="14" height="14" rx="2" ry="2"/>
                    <path d="M23 7l-7 5v-4a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4l7 5V7z"/>
                  </>
                )}
              </svg>
            </button>

            <button
              onClick={onEndCall}
              className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-500 hover:bg-red-600 transition flex items-center justify-center shadow-lg shadow-red-500/30"
              title={t.endCall}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
