import { useState, useCallback, useEffect } from 'react';
import { useWebRTC } from './useWebRTC';

interface UseVideoCallProps {
  chatId: string;
  currentUserId: string;
  onCallEnd?: () => void;
  listenAllIncoming?: boolean;
  handleIncomingOffers?: boolean;
}

export const useVideoCall = ({
  chatId,
  currentUserId,
  onCallEnd,
  listenAllIncoming,
  handleIncomingOffers,
}: UseVideoCallProps) => {
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<{ id: string; name: string; avatar?: string } | null>(null);

  const {
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
  } = useWebRTC({ chatId, currentUserId, listenAllIncoming, handleIncomingOffers });

  // Слушаем события завершения звонка
  useEffect(() => {
    const handleCallEnded = (event: CustomEvent) => {
      console.log('📞 [useVideoCall] Call ended event received:', event.detail);
      // Закрываем модалку только если звонок не активен
      // Или если это не наш собственный вызов
      setIsCallModalOpen(false);
      setTargetUser(null);
      if (onCallEnd) {
        onCallEnd();
      }
    };

    window.addEventListener('call_ended', handleCallEnded as EventListener);

    return () => {
      window.removeEventListener('call_ended', handleCallEnded as EventListener);
    };
  }, [onCallEnd]);

  const handleStartCall = useCallback(async (userId: string, userName: string, userAvatar?: string) => {
    console.log('📞 [useVideoCall] Starting call to:', userId);
    setTargetUser({ id: userId, name: userName, avatar: userAvatar });
    setIsCallModalOpen(true);
    await startCall(userId);
  }, [startCall]);

	  const handleEndCall = useCallback(() => {
	    console.log('📞 [useVideoCall] Ending call');
	    if (targetUser) {
	      endCall(targetUser.id, false, isCalling && !isCallActive ? 'cancel_call' : 'end_call');
	    }
	    setIsCallModalOpen(false);
	    setTargetUser(null);
    if (onCallEnd) {
      onCallEnd();
    }
	  }, [endCall, targetUser, onCallEnd, isCalling, isCallActive]);

  const handleCloseModal = useCallback(() => {
    console.log('📞 [useVideoCall] Closing modal');
    // НЕ завершаем звонок при закрытии модалки, если звонок активен
    // Только если пользователь сам нажал "завершить"
    setIsCallModalOpen(false);
    setTargetUser(null);
  }, []);

  const openCallModal = useCallback((userId: string, userName: string, userAvatar?: string) => {
    console.log('📞 [useVideoCall] Opening call modal for:', userId);
    setTargetUser({ id: userId, name: userName, avatar: userAvatar });
    setIsCallModalOpen(true);
  }, []);

    return {
      isCallModalOpen,
      targetUser,
      localStream,
      remoteStream,
      isCallActive,
      isCalling,
      incomingCall,
      startCall,
      endCall,
      handleStartCall,
      handleEndCall,
      handleCloseModal,
      openCallModal,
      answerCall,
      acceptIncomingCall,
      initLocalStream,
  };
};
