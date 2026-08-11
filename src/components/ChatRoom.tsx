import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../lib/redux/hooks';
import { fetchWithAuth } from '../lib/api';
import { globalSocket, socket } from '../lib/socket';
import StickerPicker from './StickerPicker';
import LoadingScreen from './LoadingScreen';
import { translations } from '../lib/locales';
import type { Message } from '../types/message';
import type { Chat, ChatInfo } from '../types/chat';
import type { User } from '../types/user';
import UserMenu from './UserMenu';
import ImageUploader from './ImageUploader';
import ImageViewer from './ImageViewer';
import Avatar from './Avatar';
import VideoCallModal from './VideoCallModal';
import { useVideoCall } from '../hooks/useVideoCall';
import { getCachedChatRoom, setCachedChatRoom } from '../lib/cache';
import { getUserDisplayName, getUserUsernameLabel, userMatchesSearchQuery } from '../lib/userDisplay';
import { uploadMedia } from '../lib/mediaUpload';
import { getMessagePreview as getPreview } from '../lib/messagePreview';
import { cacheChatBackgroundImage, getCachedChatBackgroundImage, hasChatBackgroundCache } from '../lib/chatBackgroundCache';
import VoiceMessage from './messages/VoiceMessage';
import VideoNote from './messages/VideoNote';
import CreateSpaceModal from './CreateSpaceModal';

const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const SWIPE_REPLY_THRESHOLD = 72;

async function inspectVideoBlob(blob: Blob): Promise<{ width: number; height: number; duration: number }> {
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const timeout = window.setTimeout(() => reject(new Error('metadata timeout')), 8000);
      const finish = (result: { width: number; height: number; duration: number }) => { window.clearTimeout(timeout); resolve(result); };
      video.preload = 'metadata';
      video.onloadedmetadata = () => finish({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
      video.onerror = () => { window.clearTimeout(timeout); reject(new Error('metadata error')); };
      video.src = url;
      video.load();
    });
  } finally { URL.revokeObjectURL(url); }
}
const SWIPE_REPLY_MAX = 96;
const MESSAGE_DRAG_THRESHOLD = 10;

type ChatBackground = {
  background_type: 'default' | 'gradient' | 'image';
  background_value: string | null;
  updated_at?: number | null;
  updated_by_user_id?: string | null;
};

const DEFAULT_CHAT_BACKGROUND: ChatBackground = { background_type: 'default', background_value: null };
const BACKGROUND_PRESETS = {
  aurora: { labelKey: 'backgroundNebula', background: 'radial-gradient(circle at 18% 12%, #a855f7 0%, transparent 28%), radial-gradient(circle at 82% 72%, #db2777 0%, transparent 30%), linear-gradient(135deg, #172554 0%, #581c87 48%, #831843 100%)' },
  lavender: { labelKey: 'backgroundLavender', background: 'radial-gradient(circle at 78% 15%, #c4b5fd 0%, transparent 32%), linear-gradient(135deg, #312e81 0%, #7e22ce 48%, #a78bfa 100%)' },
  sunset: { labelKey: 'backgroundRose', background: 'radial-gradient(circle at 85% 15%, #f472b6 0%, transparent 34%), linear-gradient(135deg, #4a044e 0%, #86198f 48%, #be185d 100%)' },
  midnight: { labelKey: 'backgroundMidnight', background: 'radial-gradient(circle at 20% 10%, #312e81 0%, transparent 38%), linear-gradient(135deg, #0f172a 0%, #1e1b4b 52%, #312e81 100%)' },
  ocean: { labelKey: 'backgroundOcean', background: 'radial-gradient(circle at 18% 18%, #22d3ee55 0%, transparent 28%), linear-gradient(135deg, #172554 0%, #155e75 48%, #312e81 100%)' },
  hearts: { labelKey: 'backgroundHearts', background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'34\' height=\'34\' viewBox=\'0 0 34 34\'%3E%3Cpath d=\'M17 24C5 16 10 7 17 13C24 7 29 16 17 24Z\' fill=\'%23f9a8d4\' fill-opacity=\'.20\'/%3E%3C/svg%3E") 0 0 / 34px 34px repeat, linear-gradient(135deg, #4a044e, #581c87)' },
  stars: { labelKey: 'backgroundStars', background: 'radial-gradient(circle, #e9d5ff88 1px, transparent 1.6px) 0 0 / 24px 24px, radial-gradient(circle, #fbcfe888 1px, transparent 1.6px) 12px 10px / 30px 30px, linear-gradient(135deg, #1e1b4b, #581c87)' },
  bubbles: { labelKey: 'backgroundBubbles', background: 'radial-gradient(circle at 8px 8px, transparent 0 5px, #ddd6fe33 5.5px 6.5px, transparent 7px) 0 0 / 28px 28px, linear-gradient(135deg, #312e81, #701a75)' },
  sparkles: { labelKey: 'backgroundSparkles', background: 'radial-gradient(ellipse at center, #f5d0feaa 0 1px, transparent 1.8px) 0 0 / 22px 22px, linear-gradient(45deg, transparent 48%, #e9d5ff33 49% 51%, transparent 52%) 0 0 / 22px 22px, linear-gradient(135deg, #3b0764, #6d28d9)' },
  crown: { labelKey: 'backgroundCrown', background: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'38\' height=\'30\' viewBox=\'0 0 38 30\'%3E%3Cpath d=\'M8 20L5 9l7 5 7-8 7 8 7-5-3 11H8Z\' fill=\'%23fde68a\' fill-opacity=\'.18\'/%3E%3C/svg%3E") 0 0 / 38px 30px repeat, linear-gradient(135deg, #431407, #701a75)' },
  waves: { labelKey: 'backgroundWaves', background: 'repeating-radial-gradient(ellipse at 0 100%, transparent 0 10px, #a5b4fc22 11px 13px, transparent 14px 24px), linear-gradient(135deg, #172554, #4c1d95)' },
} as const;

type IconProps = { className?: string };

function ReplyIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 17l-5-5 5-5" />
      <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function ForwardIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 17 20 12 15 7" />
      <path d="M4 18v-2a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

function EditIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function DeleteIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function ChatRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, language } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  
  // ===== STATE =====
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [spaceState, setSpaceState] = useState<{ status: 'not_created' | 'pending' | 'active'; can_accept?: boolean; created_by_me?: boolean } | null>(null);
  const [showSpaceMenu, setShowSpaceMenu] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [savedMemoryIds, setSavedMemoryIds] = useState<Set<string>>(new Set());
  const [spaceToast, setSpaceToast] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [selectedImages, setSelectedImages] = useState<{ files: File[]; previews: string[] }>({ files: [], previews: [] });
  const [isSending, setIsSending] = useState(false);
  const [recorderState, setRecorderState] = useState<'idle' | 'recording_voice' | 'recording_video' | 'preview_voice' | 'preview_video' | 'uploading' | 'sending' | 'error'>('idle');
  const [recorded, setRecorded] = useState<{ type: 'voice' | 'video_note'; blob: Blob; url: string; duration: number } | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<Message['media']>(null);
  const [mediaError, setMediaError] = useState<'upload' | 'message' | null>(null);
  const [mediaMode, setMediaMode] = useState<'voice' | 'video_note'>(() => localStorage.getItem('queenchat-media-record-mode') === 'video_note' ? 'video_note' : 'voice');
  const [uploadProgress, setUploadProgress] = useState(0);
  const recording = recorderState === 'recording_voice' ? 'voice' : recorderState === 'recording_video' ? 'video_note' : null;
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const recordingStartedAtRef = useRef(0);
  const mediaSendInFlightRef = useRef(false);
  const mediaLongPressTimerRef = useRef<number | null>(null);
  const mediaLongPressTriggeredRef = useRef(false);
  const recordingCancelledRef = useRef(false);
  const recordingTypeRef = useRef<'voice' | 'video_note' | null>(null);
  const chatBackgroundObjectUrlRef = useRef<string | null>(null);
  const chatBackgroundVersionRef = useRef(0);
  const chatBackgroundStateRef = useRef<ChatBackground>(DEFAULT_CHAT_BACKGROUND);
  const chatBackgroundSourceRef = useRef<'cache' | 'server' | 'websocket'>('server');
  const [loading, setLoading] = useState(true);
  const [hasCachedRoom, setHasCachedRoom] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [participantsModal, setParticipantsModal] = useState(false);
  const [isEditingChat, setIsEditingChat] = useState(false);
  const [editChatName, setEditChatName] = useState('');
  const [editChatAvatar, setEditChatAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarViewer, setAvatarViewer] = useState<string | null>(null);
  const [showAddParticipants, setShowAddParticipants] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [addingUsers, setAddingUsers] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState<{ userId: string; username: string; displayName: string } | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [activeMessageMenu, setActiveMessageMenu] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [commentsMessage, setCommentsMessage] = useState<Message | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [deleteConfirmMessage, setDeleteConfirmMessage] = useState<Message | null>(null);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [swipeState, setSwipeState] = useState<{ messageId: string | null; offset: number; armed: boolean }>({
    messageId: null,
    offset: 0,
    armed: false,
  });
  const [forwardMessage, setForwardMessage] = useState<Message | null>(null);
  const [forwardChats, setForwardChats] = useState<Chat[]>([]);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardLoading, setForwardLoading] = useState(false);
  const [forwardSendingChatId, setForwardSendingChatId] = useState<string | null>(null);
  const [chatBackground, setChatBackground] = useState<ChatBackground>(DEFAULT_CHAT_BACKGROUND);
  const [chatBackgroundImageUrl, setChatBackgroundImageUrl] = useState<string | null>(null);
  const [showBackgroundSettings, setShowBackgroundSettings] = useState(false);
  const [pendingBackground, setPendingBackground] = useState<ChatBackground>(DEFAULT_CHAT_BACKGROUND);
  const [backgroundImageFile, setBackgroundImageFile] = useState<File | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [savingBackground, setSavingBackground] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  // ===== REFS =====
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement>(null);
  const isNearMessagesBottomRef = useRef(true);
  const bottomSyncFrameRef = useRef<number | null>(null);
  const bottomSyncSecondFrameRef = useRef<number | null>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const suppressMessageClickRef = useRef(false);
  const swipeGestureRef = useRef<{
    messageId: string | null;
    pointerId: number | null;
    startX: number;
    startY: number;
    dragging: boolean;
    verticalDragging: boolean;
    offset: number;
    armed: boolean;
  }>({
    messageId: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    dragging: false,
    verticalDragging: false,
    offset: 0,
    armed: false,
  });
  const apiUrl = import.meta.env.VITE_API_URL;
	  const isMounted = useRef(true);
	  const messageIds = useRef<Set<string>>(new Set());
	  const hasCachedRoomRef = useRef(false);

  // ===== VIDEO CALL HOOK =====
  const {
    isCallModalOpen,
    targetUser,
    localStream,
    remoteStream,
    isCallActive,
    isCalling,
    startCall,
    endCall,
    handleStartCall,
    handleEndCall,
    handleCloseModal,
    openCallModal,
    answerCall,
    initLocalStream,
  } = useVideoCall({
    chatId: id || '',
    currentUserId: user?.id || '',
    handleIncomingOffers: false,
    onCallEnd: () => {
      console.log('📞 [ChatRoom] Call ended callback');
      handleCloseModal();
    },
  });

  // ===== ВСПОМОГАТЕЛЬНЫЕ ПЕРЕМЕННЫЕ =====
  const getChatDisplayName = () => {
    if (chat?.name && (chat.chat_type === 'group' || chat.chat_type === 'channel')) {
      return chat.name;
    }
    
    if (chat?.chat_type === 'private' && chat?.participants) {
      const otherUser = chat.participants.find(p => p.user_id !== user?.id);
      return getUserDisplayName(otherUser, t.userUnknown);
    }
    
    return t.chat;
  };

  const getOtherUser = () => {
    if (chat?.chat_type === 'private' && chat?.participants) {
      return chat.participants.find(p => p.user_id !== user?.id);
    }
    return null;
  };

  const chatName = getChatDisplayName();
  const otherUser = getOtherUser();
  const isGroup = chat?.chat_type === 'group';
  const isChannel = chat?.chat_type === 'channel';
  const isPrivate = chat?.chat_type === 'private';
  const isCreator = chat?.created_by === user?.id;
  const canChangeBackground = isPrivate || isCreator;

  const refreshSpaceState = useCallback(async () => {
    if (!id || !isPrivate) { setSpaceState(null); return; }
    const response = await fetchWithAuth(`/spaces/${id}/state`);
    if (response.ok) setSpaceState(await response.json());
  }, [id, isPrivate]);

  useEffect(() => { refreshSpaceState(); }, [refreshSpaceState]);

  useEffect(() => {
    if (!id || spaceState?.status !== 'active') { setSavedMemoryIds(new Set()); return; }
    fetchWithAuth(`/spaces/${id}/memories?limit=100`).then(async response => {
      if (!response.ok) return [];
      return response.json();
    }).then(items => setSavedMemoryIds(new Set((items || []).map((item: { message_id: string }) => item.message_id)))).catch(() => undefined);
  }, [id, spaceState?.status]);

  const toggleMoment = async (message: Message) => {
    if (!id || spaceState?.status !== 'active') return;
    const saved = savedMemoryIds.has(message.id);
    const response = await fetchWithAuth(`/spaces/${id}/memories/${message.id}`, { method: saved ? 'DELETE' : 'POST' });
    if (!response.ok) return;
    setSavedMemoryIds(previous => {
      const next = new Set(previous);
      if (saved) next.delete(message.id); else next.add(message.id);
      return next;
    });
    setActiveMessageMenu(null);
    setSpaceToast(saved ? 'Убрано из моментов' : 'Сохранено в ваши моменты');
    window.setTimeout(() => setSpaceToast(null), 2600);
  };

  const getChatColor = (chatType: string) => {
    switch (chatType) {
      case 'group':
        return 'from-green-500 to-teal-500';
      case 'channel':
        return 'from-yellow-500 to-orange-500';
      default:
        return 'from-purple-500 to-pink-500';
    }
  };

  const chatColor = getChatColor(chat?.chat_type || 'private');

  // ===== ПРОВЕРКА ПРАВ =====
  const canSendMessages = () => {
    if (!chat || !user) return false;
    
    if (chat.chat_type === 'private' || chat.chat_type === 'group') {
      return true;
    }
    
    if (chat.chat_type === 'channel') {
      return chat.created_by === user.id;
    }
    
    return false;
  };

  const canReply = () => {
    if (!chat || !user) return false;
    
    if (chat.chat_type === 'private' || chat.chat_type === 'group') {
      return true;
    }
    
    if (chat.chat_type === 'channel') {
      return chat.created_by === user.id;
    }
    
    return false;
  };

  const canManageParticipants = () => {
    if (!chat || !user) return false;
    if (chat.chat_type === 'group' || chat.chat_type === 'channel') {
      return chat.created_by === user.id;
    }
    return false;
  };

  const canCall = (targetUserId: string) => {
    if (!user) return false;
    if (targetUserId === user.id) return false;
    if (chat?.chat_type === 'channel' && chat.created_by !== user.id) return false;
    return true;
	  };

  const handleCallUser = useCallback(async (userId: string, userName: string, userAvatar?: string) => {
    if (!canCall(userId)) {
      console.warn('⚠️ [ChatRoom] Cannot call this user');
      return;
    }
    
    console.log('📞 [ChatRoom] Starting outgoing call to:', userId);
    
    try {
      // App owns the persistent WebRTC controller. ChatRoom only requests a
      // call, so route changes cannot tear down its PeerConnection.
      window.dispatchEvent(new CustomEvent('queenchat_start_call', {
        detail: { userId, userName, userAvatar, chatId: id },
      }));
    } catch (error) {
      console.error('❌ [ChatRoom] Error starting call:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: t.callStartFailed,
      });
      handleCloseModal();
    }
  }, [id, handleCloseModal]);

  // ===== ОСТАЛЬНЫЕ ФУНКЦИИ =====
  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  const scheduleBottomSync = useCallback((reason: string) => {
    if (bottomSyncFrameRef.current !== null) cancelAnimationFrame(bottomSyncFrameRef.current);
    if (bottomSyncSecondFrameRef.current !== null) cancelAnimationFrame(bottomSyncSecondFrameRef.current);
    bottomSyncFrameRef.current = requestAnimationFrame(() => {
      bottomSyncSecondFrameRef.current = requestAnimationFrame(() => {
        const scroll = messagesScrollRef.current;
        if (!scroll) return;
        const target = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
        scroll.scrollTop = target;
        isNearMessagesBottomRef.current = true;

        const composerRect = composerRef.current?.getBoundingClientRect();
        const scrollRect = scroll.getBoundingClientRect();
        const lastMessageRect = lastMessageRef.current?.getBoundingClientRect();
        const composerHeight = composerRect?.height || 0;
        console.info('[ChatScroll]', {
          reason,
          scrollTop: scroll.scrollTop,
          scrollHeight: scroll.scrollHeight,
          clientHeight: scroll.clientHeight,
          composerHeight,
          distanceFromBottom: scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight,
          lastMessageBottom: lastMessageRect?.bottom ?? null,
          viewportBottom: scrollRect.bottom,
          visibleBottomBeforeComposer: composerRect?.top ?? scrollRect.bottom,
          gap: lastMessageRect && composerRect ? composerRect.top - lastMessageRect.bottom : null,
        });
      });
    });
  }, []);

  useEffect(() => {
    if (loading) return;

    const root = headerRef.current?.parentElement;
    const updateOverlayHeights = () => {
      if (!root) return;
      const shouldStayAtBottom = isNearMessagesBottomRef.current;
      root.style.setProperty('--chat-header-height', `${headerRef.current?.offsetHeight || 0}px`);
      root.style.setProperty('--chat-composer-height', `${composerRef.current?.offsetHeight || 0}px`);
      // A preview/reply can make the overlay taller after cached history has
      // rendered. Keep a reader who was already at bottom above that overlay.
      if (shouldStayAtBottom) scheduleBottomSync('composer-resize');
    };

    updateOverlayHeights();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateOverlayHeights);
    if (headerRef.current) observer?.observe(headerRef.current);
    if (composerRef.current) observer?.observe(composerRef.current);
    window.addEventListener('resize', updateOverlayHeights);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateOverlayHeights);
    };
  }, [chat?.id, editingMessage?.id, loading, replyTo?.id, scheduleBottomSync, selectedImages.previews.length]);

  const isMessageDeleted = useCallback((msg: Message) => Boolean(msg.deleted_at), []);

  const cancelReply = () => {
    setReplyTo(null);
  };

  const cancelEditing = useCallback(() => {
    setEditingMessage(null);
    setNewMessage('');
  }, []);

  const clearSelectedImages = () => {
    selectedImages.previews.forEach(preview => URL.revokeObjectURL(preview));
    setSelectedImages({ files: [], previews: [] });
  };

  const handleImagesSelected = (files: File[], previews: string[]) => {
    setSelectedImages(prev => ({
      files: [...prev.files, ...files].slice(0, 10),
      previews: [...prev.previews, ...previews].slice(0, 10),
    }));
    messageInputRef.current?.focus();
  };

  const removeSelectedImage = (index: number) => {
    setSelectedImages(prev => {
      URL.revokeObjectURL(prev.previews[index]);
      return {
        files: prev.files.filter((_, idx) => idx !== index),
        previews: prev.previews.filter((_, idx) => idx !== index),
      };
    });
  };

  const openUserProfile = (username: string) => {
    if (username === user?.username) {
      navigate('/profile');
    } else {
      navigate(`/user/${username}`);
    }
  };

  const getChatDisplay = useCallback((targetChat: Chat) => {
    if (targetChat.name && targetChat.chat_type !== 'private') {
      return targetChat.name;
    }
    if (targetChat.chat_type === 'private') {
      const otherParticipant = targetChat.participants?.find(participant => participant.user_id !== user?.id);
      return getUserDisplayName(otherParticipant, targetChat.name || t.userUnknown);
    }
    return targetChat.name || t.chat;
  }, [t.chat, user?.id]);

  const getChatAvatarProps = useCallback((targetChat: Chat) => {
    if (targetChat.chat_type === 'private') {
      const otherParticipant = targetChat.participants?.find(participant => participant.user_id !== user?.id);
      return {
        userId: otherParticipant?.user_id,
        name: getUserDisplayName(otherParticipant, targetChat.name || t.userUnknown),
        src: otherParticipant?.avatar,
        isGroup: false,
        isChannel: false,
      };
    }
    return {
      userId: undefined,
      name: targetChat.name || t.chat,
      src: targetChat.avatar || undefined,
      isGroup: targetChat.chat_type === 'group',
      isChannel: targetChat.chat_type === 'channel',
    };
  }, [t.chat, user?.id]);

  const loadForwardChats = useCallback(async () => {
    setForwardLoading(true);
    try {
      const response = await fetchWithAuth(`/chats/`);
      if (!response.ok) throw new Error(t.failedToLoadChat);
      const data = await response.json();
      setForwardChats(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error loading forward chats:', error);
      setForwardChats([]);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToLoadChat,
      });
    } finally {
      setForwardLoading(false);
    }
  }, [t.error, t.failedToLoadChat]);

  const openForwardModal = useCallback((msg: Message) => {
    setForwardMessage(msg);
    setForwardSearch('');
    setActiveMessageMenu(null);
    void loadForwardChats();
  }, [loadForwardChats]);

  const closeForwardModal = () => {
    if (forwardSendingChatId) return;
    setForwardMessage(null);
    setForwardSearch('');
  };

  const scrollToMessage = (messageId: string) => {
    const element = document.getElementById(`message-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('bg-purple-500/30', 'transition-all', 'duration-500');
      setTimeout(() => {
        element.classList.remove('bg-purple-500/30');
      }, 2000);
    }
  };

  const parseImages = useCallback((msg: Message): string[] => {
    if (msg.images && Array.isArray(msg.images)) {
      return msg.images;
    }
    if (msg.images && typeof msg.images === 'string') {
      try {
        const parsed = JSON.parse(msg.images);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // Ignore malformed legacy image payloads.
      }
    }
    if (msg.content && msg.content.startsWith('["/uploads/')) {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].startsWith('/uploads/')) {
          return parsed;
        }
      } catch {
        // Ignore malformed legacy image payloads.
      }
    }
    if (msg.is_image && msg.content && msg.content.startsWith('/uploads/')) {
      return [msg.content];
    }
    return [];
  }, []);

  const normalizeMessage = useCallback((msg: Message): Message => {
    const images = parseImages(msg);
    const content = (msg.content || '').trim();
    const legacyImageContent = msg.is_image && (
      content.startsWith('/uploads/') || content.startsWith('["/uploads/')
    );

    return {
      ...msg,
      content: legacyImageContent ? '' : msg.content,
      is_image: msg.is_image || images.length > 0,
      images: images.length > 0 ? images : msg.images,
      edited_at: msg.edited_at,
      deleted_at: msg.deleted_at,
      reactions: msg.reactions || [],
    };
  }, [parseImages]);

  const getMessagePreview = (msg: Message): string => getPreview(msg, language as 'ru' | 'en', { includeDuration: true, deletedLabel: t.messageDeleted });

  // Tracks are stopped only after MediaRecorder has emitted its final dataavailable
  // and stop events; stopping them first can leave Firefox with an incomplete WebM.
  const cleanupRecording = () => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; recorderRef.current = null; };
  const stopRecorder = (reason: 'stop' | 'cancel') => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (reason === 'cancel') recordingCancelledRef.current = true;
    console.info(`[MediaRecorder] ${reason} requested`, { state: recorder.state });
    // Firefox video WebM is recorded as one complete container. Do not turn it
    // into a sequence of fragments with requestData() just before stop().
    if (recordingTypeRef.current === 'voice') {
      try { recorder.requestData(); } catch { /* The final stop dataavailable remains authoritative. */ }
    }
    recorder.stop();
  };
  const discardRecording = () => {
    if (recorderRef.current?.state === 'recording') { stopRecorder('cancel'); return; }
    cleanupRecording(); if (recorded) URL.revokeObjectURL(recorded.url); setRecorded(null); setUploadedMedia(null); setMediaError(null); setRecorderState('idle'); setRecordingSeconds(0);
  };
  const stopRecording = () => stopRecorder('stop');
  const toggleMediaMode = () => { const next = mediaMode === 'voice' ? 'video_note' : 'voice'; setMediaMode(next); localStorage.setItem('queenchat-media-record-mode', next); };
  const clearMediaLongPress = () => { if (mediaLongPressTimerRef.current !== null) window.clearTimeout(mediaLongPressTimerRef.current); mediaLongPressTimerRef.current = null; };
  const onMediaPointerDown = () => { console.info('[MediaRecorder] pointer down'); mediaLongPressTriggeredRef.current = false; clearMediaLongPress(); mediaLongPressTimerRef.current = window.setTimeout(() => { mediaLongPressTriggeredRef.current = true; console.info('[MediaRecorder] long press threshold reached'); void startRecording(mediaMode); }, 400); };
  const onMediaPointerUp = () => { console.info('[MediaRecorder] pointer up', { longPress: mediaLongPressTriggeredRef.current }); clearMediaLongPress(); if (!mediaLongPressTriggeredRef.current) toggleMediaMode(); };
  const startRecording = async (type: 'voice' | 'video_note') => {
    try {
      console.info('[MediaRecorder] start requested', { type });
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error(language === 'ru' ? 'Запись не поддерживается устройством' : 'Recording is not supported');
      const stream = await navigator.mediaDevices.getUserMedia(type === 'voice' ? { audio: true } : { audio: true, video: { facingMode: 'user' } });
      const videoCandidates = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      const candidates = type === 'voice' ? ['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/webm','audio/mp4'] : videoCandidates;
      console.info('[MediaRecorder] supported mime candidates=', candidates.map(candidate => ({ candidate, supported: MediaRecorder.isTypeSupported(candidate) })));
      // Firefox selects its supported VP8/Opus codecs for a generic WebM request;
      // this avoids an explicitly fragmented codec profile for video notes.
      const mime = type === 'video_note'
        ? ['video/webm', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/mp4'].find(MediaRecorder.isTypeSupported)
        : candidates.find(MediaRecorder.isTypeSupported);
      const options: MediaRecorderOptions = mime ? { mimeType: mime } : {};
      if (type === 'video_note') { options.videoBitsPerSecond = 1_000_000; options.audioBitsPerSecond = 64_000; }
      console.info('[MediaRecorder] stream tracks=', {
        video: stream.getVideoTracks().map(track => ({ readyState: track.readyState, enabled: track.enabled, muted: track.muted, settings: track.getSettings() })),
        audio: stream.getAudioTracks().map(track => ({ readyState: track.readyState, enabled: track.enabled, muted: track.muted, settings: track.getSettings() })),
      });
      const recorder = new MediaRecorder(stream, options); const chunks: Blob[] = [];
      recordingCancelledRef.current = false;
      console.info('[MediaRecorder] actual mime=', recorder.mimeType);
      recorder.ondataavailable = e => { console.info('[MediaRecorder] dataavailable size=', e.data.size); if (e.data.size) chunks.push(e.data); };
      recorder.onstop = async () => {
        console.info('[MediaRecorder] stop event');
        const totalSize = chunks.reduce((n, chunk) => n + chunk.size, 0);
        console.info('[MediaRecorder] chunks=', chunks.length, 'chunkSizes=', chunks.map(chunk => chunk.size), 'totalSize=', totalSize);
        const blob = new Blob(chunks, { type: recorder.mimeType }); const limit = type === 'voice' ? 25 : 100;
        const duration = Math.max(0, (Date.now() - recordingStartedAtRef.current) / 1000);
        const minimumSize = type === 'voice' ? 1024 : 5000;
        const cancelled = recordingCancelledRef.current;
        // This is deliberately after final dataavailable/stop, before any tracks stop.
        cleanupRecording();
        if (cancelled) { recordingTypeRef.current = null; setRecorderState('idle'); setRecordingSeconds(0); return; }
        console.info('[MediaRecorder] blobSize=', blob.size, 'localDuration=', duration);
        if (blob.size > limit * 1024 * 1024) { setRecorderState('error'); return; }
        if (duration < 1 || blob.size < minimumSize) {
          setRecorded(null); setUploadedMedia(null); setMediaError(null); setRecorderState('idle'); setRecordingSeconds(0);
          setModal({ isOpen: true, title: t.error, message: language === 'ru' ? 'Запись слишком короткая' : 'Recording is too short' });
          return;
        }
        let previewDuration = duration;
        if (type === 'video_note') {
          try {
            const metadata = await inspectVideoBlob(blob);
            console.info('[MediaRecorder] video metadata=', metadata);
            if (!metadata.width || !metadata.height) throw new Error('video has no decoded frames');
            if (Number.isFinite(metadata.duration) && metadata.duration > 0) previewDuration = metadata.duration;
          } catch (error) {
            console.warn('[MediaRecorder] video metadata validation failed', error);
            recordingTypeRef.current = null; setRecorded(null); setUploadedMedia(null); setMediaError(null); setRecorderState('idle'); setRecordingSeconds(0);
            setModal({ isOpen: true, title: t.error, message: language === 'ru' ? 'Не удалось завершить видеозапись' : 'Unable to finish video recording' });
            return;
          }
        }
        recordingTypeRef.current = null;
        setRecorded({ type, blob, url: URL.createObjectURL(blob), duration: Math.round(previewDuration) }); setUploadedMedia(null); setMediaError(null); setRecorderState(type === 'voice' ? 'preview_voice' : 'preview_video');
      };
      recorder.onerror = () => { console.error('[MediaRecorder] recorder error'); setRecorderState('error'); };
      document.activeElement instanceof HTMLElement && document.activeElement.blur();
      recorderRef.current = recorder; streamRef.current = stream; recordingTypeRef.current = type; recordingStartedAtRef.current = Date.now();
      if (type === 'voice') recorder.start(250); else recorder.start();
      console.info('[MediaRecorder] recorder started', { strategy: type === 'voice' ? 'timeslice=250ms' : 'single-container' }); setRecorderState(type === 'voice' ? 'recording_voice' : 'recording_video'); setRecordingSeconds(0);
    } catch (error) { setModal({ isOpen: true, title: t.error, message: error instanceof Error ? error.message : String(error) }); }
  };
  const sendRecorded = async () => {
    if (!recorded || !id || mediaSendInFlightRef.current) return;
    mediaSendInFlightRef.current = true; let stage: 'upload' | 'message' = uploadedMedia ? 'message' : 'upload';
    try {
      let media = uploadedMedia;
      if (!media) {
        console.info('[MediaSend] upload started'); setMediaError(null); setRecorderState('uploading'); setUploadProgress(0);
        console.info('[MediaRecorder]', { type: recorded.type, blobType: recorded.blob.type, blobSize: recorded.blob.size, duration: recorded.duration });
        const mime = recorded.blob.type; const extension = mime.includes('mp4') ? 'mp4' : mime.includes('ogg') ? 'ogg' : 'webm';
        const result = await uploadMedia(`${apiUrl}/files/${recorded.type === 'voice' ? 'upload-voice' : 'upload-video-note'}`, recorded.blob, `${recorded.type === 'voice' ? 'voice' : 'video-note'}.${extension}`, setUploadProgress);
        console.info('[MediaSend] upload completed'); console.info('[MediaSend] upload response=', result);
        media = { type: recorded.type, ...result } as Message['media']; setUploadedMedia(media);
      }
      stage = 'message'; setRecorderState('sending'); console.info('[MediaSend] create message started');
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`, { method: 'POST', body: JSON.stringify({ content: '', media, reply_to_id: replyTo?.id }) });
      const body = await response.json().catch(() => ({})); console.info('[MediaSend] create message status=', response.status); console.info('[MediaSend] create message body=', body);
      if (!response.ok) throw new Error(`message status ${response.status}`);
      const message = normalizeMessage(body as Message); console.info('[MediaSend] message normalized');
      setMessages(prev => [...prev, message]); URL.revokeObjectURL(recorded.url); setRecorded(null); setUploadedMedia(null); setMediaError(null); setReplyTo(null); setRecorderState('idle'); console.info('[MediaSend] success'); scheduleBottomSync('outgoing-media');
    } catch (error) { console.error('[MediaSend] failed stage=', stage, error); setMediaError(stage); setRecorderState('error');
    } finally { mediaSendInFlightRef.current = false; }
  };
  useEffect(() => () => { if (recorderRef.current?.state === 'recording') stopRecorder('cancel'); else cleanupRecording(); }, []);
  useEffect(() => { if (!recording) return; const max = recording === 'voice' ? 300 : 60; const timer = window.setInterval(() => setRecordingSeconds(s => { if (s + 1 >= max) stopRecording(); return s + 1; }), 1000); return () => clearInterval(timer); }, [recording]);
  useEffect(() => { if (recorderState === 'recording_video' && liveVideoRef.current && streamRef.current) liveVideoRef.current.srcObject = streamRef.current; }, [recorderState]);

  const canEditMessage = useCallback((msg: Message) => {
    if (!user || msg.sender_id !== user.id || isMessageDeleted(msg)) return false;
    if (msg.is_sticker || msg.media?.type === 'voice' || msg.media?.type === 'video_note') return false;
    return true;
  }, [isMessageDeleted, user]);

  const canDeleteMessage = useCallback((msg: Message) => {
    if (!user || msg.sender_id !== user.id) return false;
    return !isMessageDeleted(msg);
  }, [isMessageDeleted, user]);

  const openImageViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(index);
  };

  const groupMessagesByDate = (msgs: Message[]) => {
    const groups: { dateKey: string; dateLabel: string; messages: Message[] }[] = [];
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    msgs.forEach((msg) => {
      const date = new Date(msg.created_at * 1000);
      const dateKey = date.toDateString();
      
      let dateLabel = '';
      if (dateKey === today.toDateString()) {
        dateLabel = t.today;
      } else if (dateKey === yesterday.toDateString()) {
        dateLabel = t.yesterday;
      } else {
        dateLabel = date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
          day: 'numeric',
          month: 'long',
          year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        });
      }

      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.dateKey === dateKey) {
        lastGroup.messages.push(msg);
      } else {
        groups.push({
          dateKey,
          dateLabel,
          messages: [msg]
        });
      }
    });

    return groups;
  };

  const replaceChatBackgroundImageUrl = useCallback((url: string | null) => {
    if (chatBackgroundObjectUrlRef.current) URL.revokeObjectURL(chatBackgroundObjectUrlRef.current);
    chatBackgroundObjectUrlRef.current = url;
    setChatBackgroundImageUrl(url);
  }, []);

  const applyChatBackground = useCallback(async (background: ChatBackground, source: 'cache' | 'server' | 'websocket') => {
    const next = background || DEFAULT_CHAT_BACKGROUND;
    const known = chatBackgroundStateRef.current;
    const knownVersion = Number(known.updated_at || 0), nextVersion = Number(next.updated_at || 0);
    if (nextVersion && knownVersion && (nextVersion < knownVersion || (source === 'server' && chatBackgroundSourceRef.current === 'websocket' && nextVersion <= knownVersion))) {
      console.info('[ChatCache] background ignored stale update');
      return;
    }
    const unchanged = known.background_type === next.background_type && known.background_value === next.background_value;
    if (unchanged && source === 'server') { console.info('[ChatCache] background server refresh unchanged'); return; }

    if (next.background_type !== 'image' || !next.background_value) {
      chatBackgroundStateRef.current = next;
      chatBackgroundVersionRef.current = nextVersion;
      chatBackgroundSourceRef.current = source;
      replaceChatBackgroundImageUrl(null);
      setChatBackground(next);
      return;
    }

    let imageUrl = source === 'cache' ? await getCachedChatBackgroundImage(next.background_value) : null;
    if (imageUrl) console.info('[ChatCache] background image cache hit');
    else {
      if (source === 'cache') console.info('[ChatCache] background image cache miss');
      // For a changed server/WS image, keep the old visual state visible until
      // the immutable replacement has been downloaded and placed in Cache Storage.
      imageUrl = await cacheChatBackgroundImage(next.background_value);
    }
    if (chatBackgroundStateRef.current.updated_at && nextVersion && Number(chatBackgroundStateRef.current.updated_at) > nextVersion) return;
    if (!imageUrl && !hasChatBackgroundCache()) imageUrl = next.background_value;
    if (!imageUrl) {
      // A failed refresh (including a 404) must not blank an already visible
      // background. Cache Storage retains the previous immutable version.
      console.warn('[ChatCache] background image refresh failed; keeping current visual state');
      return;
    }
    chatBackgroundStateRef.current = next;
    chatBackgroundVersionRef.current = nextVersion;
    chatBackgroundSourceRef.current = source;
    replaceChatBackgroundImageUrl(imageUrl);
    setChatBackground(next);
    if (source === 'server') console.info('[ChatCache] background server refresh updated');
  }, [replaceChatBackgroundImageUrl]);

  const openBackgroundSettings = () => {
    setPendingBackground(chatBackground);
    setBackgroundImageFile(null);
    setBackgroundPreview(chatBackground.background_type === 'image' ? chatBackground.background_value : null);
    setShowBackgroundSettings(true);
  };

  const selectBackgroundImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setModal({ isOpen: true, title: t.error, message: t.imageOnly });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setModal({ isOpen: true, title: t.error, message: t.imageTooLarge });
      return;
    }
    if (backgroundPreview?.startsWith('blob:')) URL.revokeObjectURL(backgroundPreview);
    setBackgroundImageFile(file);
    setBackgroundPreview(URL.createObjectURL(file));
    setPendingBackground({ background_type: 'image', background_value: null });
  };

  const saveBackground = async (backgroundToSave: ChatBackground = pendingBackground) => {
    if (!id) return;
    setSavingBackground(true);
    try {
      if (backgroundToSave.background_type === 'default') {
        const response = await fetchWithAuth(`${apiUrl}/chats/${id}/background`, { method: 'DELETE' });
        if (!response.ok) throw new Error(t.backgroundSaveFailed);
        await applyChatBackground(DEFAULT_CHAT_BACKGROUND, 'server');
      } else {
        let backgroundValue = backgroundToSave.background_value;
        if (backgroundToSave.background_type === 'image' && backgroundImageFile) {
          const formData = new FormData();
          formData.append('chat_id', id);
          formData.append('file', backgroundImageFile);
          const uploadResponse = await fetchWithAuth(`${apiUrl}/files/upload-chat-background`, { method: 'POST', body: formData });
          if (!uploadResponse.ok) throw new Error(t.backgroundUploadFailed);
          backgroundValue = (await uploadResponse.json()).url;
        }
        if (backgroundToSave.background_type === 'image' && !backgroundValue) {
          throw new Error(t.chooseImage);
        }
        const response = await fetchWithAuth(`${apiUrl}/chats/${id}/background`, {
          method: 'PUT',
          body: JSON.stringify({ background_type: backgroundToSave.background_type, background_value: backgroundValue }),
        });
        if (!response.ok) throw new Error(t.backgroundSaveFailed);
        await applyChatBackground(await response.json(), 'server');
      }
      if (backgroundPreview?.startsWith('blob:')) URL.revokeObjectURL(backgroundPreview);
      setShowBackgroundSettings(false);
    } catch (error) {
      setModal({ isOpen: true, title: t.error, message: error instanceof Error ? error.message : t.backgroundSaveFailed });
    } finally {
      setSavingBackground(false);
    }
  };

  // ===== ЗАГРУЗКА ДАННЫХ =====
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      messageIds.current.clear();
      if (chatBackgroundObjectUrlRef.current) URL.revokeObjectURL(chatBackgroundObjectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!id || id === 'undefined') {
      navigate('/chat');
    }
  }, [id, navigate]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => setIsCompactViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    if (!activeMessageMenu) return;

    const closeMenu = (event?: MouseEvent) => {
      if (event?.target instanceof Element && event.target.closest('[data-message-menu-root]')) {
        return;
      }
      setActiveMessageMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener('click', closeMenu);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMessageMenu]);

  const loadAvailableUsers = async () => {
    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/get_users`);
      const data = await response.json();
      if (Array.isArray(data)) {
        const otherUsers = data.filter(
          (u: User) => u.id !== user?.id && !chat?.participants?.some(p => p.user_id === u.id)
        );
        setAvailableUsers(otherUsers);
        setFilteredUsers(otherUsers);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: t.failedToLoadUsers,
      });
    }
  };

  useEffect(() => {
    if (showAddParticipants) {
      loadAvailableUsers();
    }
  }, [showAddParticipants]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(availableUsers);
    } else {
      const filtered = availableUsers.filter(u => userMatchesSearchQuery(u, searchQuery));
      setFilteredUsers(filtered);
    }
  }, [searchQuery, availableUsers]);

  const updateChat = async (name: string, avatar: string | null) => {
    try {
      const updateData: any = {};
      if (name !== chat?.name) updateData.name = name;
      if (avatar !== chat?.avatar) updateData.avatar = avatar;
      
      if (Object.keys(updateData).length === 0) {
        setIsEditingChat(false);
        return;
      }
      
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.failedToUpdateChat);
      }
      
      const updatedChat = await response.json();
      setChat(updatedChat);
      setIsEditingChat(false);
      
      setModal({
        isOpen: true,
        title: t.success,
        message: t.chatUpdated,
      });
    } catch (error) {
      console.error('Error updating chat:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToUpdateChat,
      });
    }
  };

  const handleAvatarFileSelect = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    
    setUploadingAvatar(true);
    try {
      const response = await fetchWithAuth(`${apiUrl}/files/upload-chat-avatar`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error(t.chatAvatarUploadFailed);
      
      const data = await response.json();
      setEditChatAvatar(data.url);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: t.chatAvatarUploadFailed,
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const addParticipants = async (userIds: string[]) => {
    setAddingUsers(true);
    try {
      for (const userId of userIds) {
        const response = await fetchWithAuth(`${apiUrl}/chats/${id}/participants/${userId}`, {
          method: 'POST',
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || t.failedToAddParticipant);
        }
      }
      
      const updatedChat = await fetchWithAuth(`${apiUrl}/chats/${id}`);
      const chatData = await updatedChat.json();
      setChat(chatData);
      
      setShowAddParticipants(false);
      setSearchQuery('');
      
      setModal({
        isOpen: true,
        title: t.success,
        message: `${userIds.length} ${t.participantsAdded}`,
      });
    } catch (error) {
      console.error('Error adding participants:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToAddParticipant,
      });
    } finally {
      setAddingUsers(false);
    }
  };

  const removeParticipant = async (userId: string, username: string) => {
    setRemoveConfirm(null);
    
    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/participants/${userId}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.failedToRemoveParticipant);
      }
      
      const updatedChat = await fetchWithAuth(`${apiUrl}/chats/${id}`);
      const chatData = await updatedChat.json();
      setChat(chatData);
      
      setModal({
        isOpen: true,
        title: t.success,
        message: isGroup 
          ? `${username}${t.participantRemovedFromGroupSuffix}`
          : `${username}${t.participantUnsubscribedFromChannelSuffix}`,
      });
    } catch (error) {
      console.error('Error removing participant:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToRemoveParticipant,
      });
    }
  };

  const leaveChat = async () => {
    setLeaveConfirm(false);
    
    try {
      let response;
      if (isChannel) {
        response = await fetchWithAuth(`${apiUrl}/chats/${id}/unsubscribe`, {
          method: 'POST',
        });
      } else {
        response = await fetchWithAuth(`${apiUrl}/chats/${id}/participants/${user!.id}`, {
          method: 'DELETE',
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.failedToLeaveChat);
      }
      
      navigate('/chat');
      window.dispatchEvent(new Event('refreshChatList'));
    } catch (error) {
      console.error('Error leaving chat:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToLeaveChat,
      });
    }
  };

  const uploadSelectedImages = async (files: File[]) => {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    const uploadResponse = await fetchWithAuth(`${apiUrl}/files/upload-images`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json().catch(() => ({}));
      throw new Error(error.detail || t.imageUploadFailed);
    }

    const { urls, errors } = await uploadResponse.json();
    if (errors) {
      throw new Error(Array.isArray(errors) ? errors.join(', ') : t.imageUploadFailed);
    }
    if (!Array.isArray(urls) || urls.length === 0) {
      throw new Error(t.imageUploadFailed);
    }
    return urls as string[];
  };

  const handleImageError = (error: string) => {
    setModal({ isOpen: true, title: t.error, message: error });
  };

  const ensureParticipant = useCallback(async (chatId: string, userId: string) => {
    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${chatId}/participants/${userId}`, {
        method: 'POST',
      });
      return response.ok || response.status === 409;
    } catch (error) {
      return false;
    }
  }, [apiUrl]);

  const handleMessagesScroll = () => {
    const scroll = messagesScrollRef.current;
    if (!scroll) return;
    isNearMessagesBottomRef.current = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 128;
  };

  const loadChatData = useCallback(async () => {
    if (!user || !id || id === 'undefined') return;

    hasCachedRoomRef.current = false;
    setHasCachedRoom(false);
    const cached = await getCachedChatRoom(user.id, id);
    if (cached) {
      messageIds.current.clear();
      cached.messages.forEach(message => messageIds.current.add(message.id));
      setChat(cached.chat);
      setMessages(cached.messages);
      console.info('[ChatCache] background cache hit chat=', id);
      await applyChatBackground(cached.background, 'cache');
      hasCachedRoomRef.current = true;
      setHasCachedRoom(true);
      setLoading(false);
    } else {
      setChat(null);
      setMessages([]);
      console.info('[ChatCache] background cache miss');
      await applyChatBackground(DEFAULT_CHAT_BACKGROUND, 'server');
      setLoading(true);
    }

    try {
      messageIds.current.clear();
      
      const [chatResponse, messagesResponse, backgroundResponse] = await Promise.all([
        fetchWithAuth(`${apiUrl}/chats/${id}`),
        fetchWithAuth(`${apiUrl}/chats/${id}/messages`),
        fetchWithAuth(`${apiUrl}/chats/${id}/background`),
      ]);

      if (!chatResponse.ok) throw new Error(t.failedToLoadChat);
      
      const chatData = await chatResponse.json();
      setChat(chatData);

      if (backgroundResponse.ok) {
        await applyChatBackground(await backgroundResponse.json(), 'server');
      }
      
      const isParticipant = chatData.participants?.some((p: any) => p.user_id === user.id);
      if (!isParticipant) {
        await ensureParticipant(id, user.id);
      }
      
      if (messagesResponse.ok) {
        let messagesData = await messagesResponse.json();
        if (Array.isArray(messagesData)) {
          messagesData = messagesData.map(normalizeMessage);
          messagesData.forEach((msg: Message) => {
            messageIds.current.add(msg.id);
          });
          messagesData.sort((a: Message, b: Message) => a.created_at - b.created_at);
          setMessages(messagesData);
        }
      }
    } catch (error) {
      console.error(error);
      if (!hasCachedRoomRef.current) navigate('/chat');
    } finally {
      setLoading(false);
    }
  }, [id, user, apiUrl, navigate, ensureParticipant, normalizeMessage, applyChatBackground]);

  useEffect(() => {
    loadChatData();
  }, [loadChatData]);

  useEffect(() => {
    if (!user || !id || !chat) return;
    const timer = window.setTimeout(() => {
      void setCachedChatRoom(user.id, id, {
        chat,
        messages: messages.slice(-100),
        background: chatBackground,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [user, id, chat, messages, chatBackground]);

  useEffect(() => {
    if (!user || !id || loading) return;

    const markEverythingAsRead = async () => {
      try {
        await fetchWithAuth(`${apiUrl}/chats/${id}/messages/read/all`, {
          method: 'POST',
        });
        await fetchWithAuth(`${apiUrl}/chats/${id}/reactions/read`, {
          method: 'PATCH',
        });
        setMessages(prev =>
          prev.map(msg => {
            if (msg.sender_id !== user.id && !msg.is_read) {
              return { ...msg, is_read: true };
            }
            return msg;
          })
        );
      } catch (error) {
        console.error('Error marking as read:', error);
      }
    };

    const timer = setTimeout(() => {
      markEverythingAsRead();
    }, 1000);
    return () => clearTimeout(timer);
  }, [id, user, loading, apiUrl]);

  useEffect(() => {
    if (!loading && messages.length > 0 && isNearMessagesBottomRef.current) {
      scheduleBottomSync('initial-load');
    }
  }, [loading, messages.length, scheduleBottomSync]);

  useEffect(() => {
    if (!user || !id) return;

    socket.connectToChat(id);

    const handleNewMessage = (newMsg: Message) => {
      const normalizedMessage = normalizeMessage(newMsg);
      if (normalizedMessage.sender_id === user.id) return;
      if (normalizedMessage.chat_id !== id) return;
      if (messageIds.current.has(normalizedMessage.id)) return;
      
      messageIds.current.add(normalizedMessage.id);
      const shouldStickToBottom = isNearMessagesBottomRef.current;
      setMessages(prev => {
        const newMessages = [...prev, normalizedMessage];
        newMessages.sort((a, b) => a.created_at - b.created_at);
        return newMessages;
      });
      if (shouldStickToBottom) scheduleBottomSync('incoming');
    };

    const handleMessageRead = (data: { message_id: string; user_id: string; chat_id: string }) => {
      if (data.chat_id !== id) return;
      
      setMessages(prev =>
        prev.map(msg => {
          if (msg.id === data.message_id) {
            return { ...msg, is_read: true };
          }
          return msg;
        })
      );
    };

    const handleMessagesRead = (data: { chat_id: string; user_id: string }) => {
      if (data.chat_id !== id) return;
      if (data.user_id === user.id) return;
      
      setMessages(prev =>
        prev.map(msg => {
          if (msg.sender_id !== user.id && !msg.is_read) {
            return { ...msg, is_read: true };
          }
          return msg;
        })
      );
    };

    const handleMessageReactionUpdated = (data: {
      chat_id: string;
      message_id: string;
      reactions: Message['reactions'];
    }) => {
      if (data.chat_id !== id) return;

      setMessages(prev =>
        prev.map(msg => (
          msg.id === data.message_id
          ? { ...msg, reactions: data.reactions || [] }
          : msg
        ))
      );
    };

    const handleReactionNotification = (data: { chat_id: string }) => {
      if (data.chat_id !== id) return;
      fetchWithAuth(`${apiUrl}/chats/${id}/reactions/read`, { method: 'PATCH' }).catch(() => {});
    };

    const handleMessageChanged = (data: { chat_id: string; message: Message }) => {
      if (data.chat_id !== id) return;

      const normalizedMessage = normalizeMessage(data.message);
      setMessages(prev =>
        prev.map(msg => (
          msg.id === normalizedMessage.id
            ? { ...msg, ...normalizedMessage, reactions: normalizedMessage.reactions || msg.reactions || [] }
            : msg
        ))
      );

      if (replyTo?.id === normalizedMessage.id) {
        setReplyTo(normalizedMessage);
      }

      if (editingMessage?.id === normalizedMessage.id && normalizedMessage.deleted_at) {
        cancelEditing();
      }
    };

    const handleChatBackgroundUpdated = (data: { chat_id: string; background: ChatBackground }) => {
      if (data.chat_id === id) void applyChatBackground(data.background || DEFAULT_CHAT_BACKGROUND, 'websocket');
    };

    socket.on('new-message', handleNewMessage);
    socket.on('message_read', handleMessageRead);
    socket.on('messages_read', handleMessagesRead);
    socket.on('message_reaction_updated', handleMessageReactionUpdated);
    socket.on('message_reaction_notification', handleReactionNotification);
    socket.on('edit_message', handleMessageChanged);
    socket.on('delete_message', handleMessageChanged);
    socket.on('chat_background_updated', handleChatBackgroundUpdated);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message_read', handleMessageRead);
      socket.off('messages_read', handleMessagesRead);
      socket.off('message_reaction_updated', handleMessageReactionUpdated);
      socket.off('message_reaction_notification', handleReactionNotification);
      socket.off('edit_message', handleMessageChanged);
      socket.off('delete_message', handleMessageChanged);
      socket.off('chat_background_updated', handleChatBackgroundUpdated);
    };
  }, [applyChatBackground, cancelEditing, editingMessage?.id, id, normalizeMessage, replyTo?.id, scheduleBottomSync, user]);

  useEffect(() => {
    if (!user || !id || messages.length === 0) return;
    
    const unreadMessages = messages.filter(
      msg => msg.sender_id !== user.id && !msg.is_read
    );
    
    if (unreadMessages.length === 0) return;
    
    const timeoutId = setTimeout(() => {
      unreadMessages.forEach(msg => {
        fetchWithAuth(`${apiUrl}/chats/${id}/messages/${msg.id}/read`, {
          method: 'PATCH',
        }).catch(console.error);
      });
    }, 500);
    
    return () => clearTimeout(timeoutId);
  }, [messages, user, id, apiUrl]);

  const updateMessageReactions = useCallback((messageId: string, reactions: Message['reactions']) => {
    setMessages(prev =>
      prev.map(msg => (
        msg.id === messageId
          ? { ...msg, reactions: reactions || [] }
          : msg
      ))
    );
  }, []);

  const handleReactionToggle = async (msg: Message, emoji: string) => {
    if (!id || !user) return;

    const myReaction = msg.reactions?.find(reaction => reaction.reacted_by_me);
    const shouldDelete = myReaction?.emoji === emoji;

    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages/${msg.id}/reaction`, {
        method: shouldDelete ? 'DELETE' : 'PUT',
        ...(shouldDelete ? {} : { body: JSON.stringify({ emoji }) }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.error);
      }

      const data = await response.json();
      updateMessageReactions(msg.id, data.reactions);
      setActiveMessageMenu(null);
    } catch (error) {
      console.error('Error updating reaction:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.error,
      });
    }
  };

  const handleForwardToChat = async (targetChatId: string) => {
    if (!id || !forwardMessage || forwardSendingChatId) return;

    try {
      setForwardSendingChatId(targetChatId);
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages/${forwardMessage.id}/forward`, {
        method: 'POST',
        body: JSON.stringify({ target_chat_id: targetChatId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.failedToSend);
      }

      const data = normalizeMessage(await response.json());
      if (targetChatId === id) {
        messageIds.current.add(data.id);
        setMessages(prev => {
          const newMessages = [...prev, data];
          newMessages.sort((a, b) => a.created_at - b.created_at);
          return newMessages;
        });
        scheduleBottomSync('outgoing-forward');
      }

      window.dispatchEvent(new Event('refreshChatList'));
      setForwardMessage(null);
      setForwardSearch('');
    } catch (error) {
      console.error('Error forwarding message:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToSend,
      });
    } finally {
      setForwardSendingChatId(null);
    }
  };

  const handleReply = (msg: Message) => {
    if (!canReply()) {
      setModal({
        isOpen: true,
        title: t.accessDenied,
        message: t.channelOnlyCreatorCanReply,
      });
      return;
    }
    if (isMessageDeleted(msg)) return;
    setActiveMessageMenu(null);
    setEditingMessage(null);
    setReplyTo(msg);
    messageInputRef.current?.focus();
  };

  const startEditingMessage = (msg: Message) => {
    if (!canEditMessage(msg)) {
      setModal({
        isOpen: true,
        title: t.accessDenied,
        message: t.cannotEditImageMessage,
      });
      return;
    }
    setActiveMessageMenu(null);
    setReplyTo(null);
    setShowStickerPicker(false);
    clearSelectedImages();
    setEditingMessage(msg);
    setNewMessage(msg.content || '');
    messageInputRef.current?.focus();
  };

  const openComments = async (msg: Message) => {
    if (!id || chat?.chat_type !== 'channel' || isMessageDeleted(msg)) return;
    const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages/${msg.id}/comments`);
    const data = await response.json();
    if (!response.ok) return;
    setCommentsMessage(msg); setComments(data.comments || []);
    setMessages(prev => prev.map(item => item.id === msg.id ? { ...item, comments_count: data.comments_count || 0 } : item));
  };
  const sendComment = async () => {
    if (!id || !commentsMessage || !commentText.trim()) return;
    const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages/${commentsMessage.id}/comments`, { method: 'POST', body: JSON.stringify({ content: commentText.trim() }) });
    const data = await response.json(); if (!response.ok) return;
    setComments(prev => [...prev, data.comment]); setCommentText('');
    setMessages(prev => prev.map(item => item.id === commentsMessage.id ? { ...item, comments_count: data.comments_count } : item));
  };

  const requestDeleteMessage = (msg: Message) => {
    if (!canDeleteMessage(msg)) return;
    setActiveMessageMenu(null);
    setDeleteConfirmMessage(msg);
  };

  const confirmDeleteMessage = async () => {
    if (!id || !deleteConfirmMessage) return;

    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages/${deleteConfirmMessage.id}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || t.error);
      }

      setMessages(prev =>
        prev.map(msg => (
          msg.id === deleteConfirmMessage.id
            ? { ...msg, deleted_at: data.deleted_at, reactions: [], is_image: false, images: [] }
            : msg
        ))
      );
      if (replyTo?.id === deleteConfirmMessage.id) {
        setReplyTo(null);
      }
      if (editingMessage?.id === deleteConfirmMessage.id) {
        cancelEditing();
      }
      setDeleteConfirmMessage(null);
      window.dispatchEvent(new Event('refreshChatList'));
    } catch (error) {
      console.error('Error deleting message:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.error,
      });
    }
  };

  const resetSwipeReply = () => {
    swipeGestureRef.current = {
      messageId: null,
      pointerId: null,
      startX: 0,
      startY: 0,
      dragging: false,
      verticalDragging: false,
      offset: 0,
      armed: false,
    };
    setSwipeState({ messageId: null, offset: 0, armed: false });
  };

  const openMessageMenu = (messageId: string) => {
    setActiveMessageMenu(prev => prev === messageId ? null : messageId);
  };

  const handleMessageClick = (event: React.MouseEvent<HTMLDivElement>, msg: Message) => {
    if (suppressMessageClickRef.current) {
      suppressMessageClickRef.current = false;
      return;
    }
    const target = event.target;
    if (isMessageDeleted(msg) || (target instanceof Element && target.closest('a, button, input, textarea, select, img, [role="button"], [data-message-interactive]'))) {
      return;
    }
    openMessageMenu(msg.id);
  };

  const handleMessagePointerDown = (event: React.PointerEvent<HTMLDivElement>, msg: Message) => {
    if (event.pointerType === 'mouse' || isMessageDeleted(msg)) return;
    suppressMessageClickRef.current = false;
    swipeGestureRef.current = {
      messageId: msg.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      verticalDragging: false,
      offset: 0,
      armed: false,
    };
  };

  const handleMessagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = swipeGestureRef.current;
    if (gesture.pointerId !== event.pointerId || !gesture.messageId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (!gesture.dragging) {
      if (Math.abs(deltaY) > MESSAGE_DRAG_THRESHOLD && Math.abs(deltaY) > Math.abs(deltaX)) {
        gesture.verticalDragging = true;
        suppressMessageClickRef.current = true;
        return;
      }
      if (deltaX < -MESSAGE_DRAG_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) + 6) {
        gesture.dragging = true;
        suppressMessageClickRef.current = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      } else {
        return;
      }
    }

    const offset = Math.max(deltaX, -SWIPE_REPLY_MAX);
    gesture.offset = offset;
    gesture.armed = Math.abs(offset) >= SWIPE_REPLY_THRESHOLD;
    if (event.cancelable) {
      event.preventDefault();
    }
    setSwipeState({
      messageId: gesture.messageId,
      offset,
      armed: gesture.armed,
    });
  };

  const handleMessagePointerEnd = (event: React.PointerEvent<HTMLDivElement>, msg: Message) => {
    const gesture = swipeGestureRef.current;
    if (gesture.pointerId !== event.pointerId) return;
    const didDrag = gesture.dragging || gesture.verticalDragging;
    const shouldReply = canReply() && gesture.dragging && gesture.messageId === msg.id && gesture.armed;
    suppressMessageClickRef.current = didDrag;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    resetSwipeReply();
    window.setTimeout(() => {
      suppressMessageClickRef.current = false;
    }, 0);
    if (shouldReply) {
      handleReply(msg);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSendMessages()) {
      setModal({
        isOpen: true,
        title: t.accessDenied,
        message: t.channelOnlyCreatorCanSend,
      });
      return;
    }
    
    if (!user || !id || isSending) return;

    const content = newMessage.trim();
    const filesToUpload = [...selectedImages.files];
    const hasImages = filesToUpload.length > 0;
    let tempId: string | null = null;

    if (!editingMessage && !content && !hasImages) return;

    try {
      setIsSending(true);

      if (editingMessage) {
        if (hasImages) {
          throw new Error(t.cannotEditImageMessage);
        }

        const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages/${editingMessage.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ content }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.detail || t.failedToSend);
        }

        const updatedMessage = normalizeMessage(data);
        setMessages(prev =>
          prev.map(msg => (
            msg.id === updatedMessage.id
              ? { ...msg, ...updatedMessage }
              : msg
          ))
        );
        setNewMessage('');
        setEditingMessage(null);
        window.dispatchEvent(new Event('refreshChatList'));
        return;
      }

      tempId = `temp-${Date.now()}`;
      const imageUrls = hasImages ? await uploadSelectedImages(filesToUpload) : [];

      const tempMessage: Message = {
        id: tempId,
        content,
        sender_id: user.id,
        chat_id: id,
        created_at: Math.floor(Date.now() / 1000),
        is_read: false,
        is_sticker: false,
        is_image: imageUrls.length > 0,
        images: imageUrls.length > 0 ? imageUrls : undefined,
        reactions: [],
      };

      messageIds.current.add(tempId);
      setMessages(prev => {
        const newMessages = [...prev, tempMessage];
        newMessages.sort((a, b) => a.created_at - b.created_at);
        return newMessages;
      });

      const payload: {
        content: string;
        is_image: boolean;
        images?: string[];
        reply_to_id?: string;
      } = {
        content,
        is_image: imageUrls.length > 0,
      };
      if (imageUrls.length > 0) {
        payload.images = imageUrls;
      }
      if (replyTo?.id) {
        payload.reply_to_id = replyTo.id;
      }
      
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(t.failedToSend);

      const data = normalizeMessage(await response.json());
      
      messageIds.current.delete(tempId);
      messageIds.current.add(data.id);
      
      setMessages(prev => 
        prev.map(msg => msg.id === tempId ? { ...data, reply_to_id: replyTo?.id } : msg)
          .sort((a, b) => a.created_at - b.created_at)
      );

      void socket.emit('send-message', { ...data, chat_id: id }).catch(error => {
        console.warn('[WSHealth] message realtime signal failed after REST save', error);
      });
      
      setNewMessage('');
      clearSelectedImages();
      setReplyTo(null);
      scheduleBottomSync('outgoing-text');
      
    } catch (error) {
      if (tempId) {
        messageIds.current.delete(tempId);
        setMessages(prev => prev.filter(msg => msg.id !== tempId));
      }
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToSend,
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSendSticker = async (stickerId: string, emoji: string) => {
    if (editingMessage) return;
    if (!canSendMessages()) {
      setModal({
        isOpen: true,
        title: t.accessDenied,
        message: t.channelOnlyCreatorCanSendStickers,
      });
      return;
    }
    
    if (!user || !id) return;

    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: emoji,
      sender_id: user.id,
      chat_id: id,
      created_at: Math.floor(Date.now() / 1000),
      is_read: false,
      is_sticker: true,
      reactions: [],
    };

    messageIds.current.add(tempId);
    setMessages(prev => {
      const newMessages = [...prev, tempMessage];
      newMessages.sort((a, b) => a.created_at - b.created_at);
      return newMessages;
    });
    setShowStickerPicker(false);

    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ sticker_id: stickerId, content: emoji }),
      });

      if (!response.ok) throw new Error(t.failedToSend);

      const data = await response.json();
      
      messageIds.current.delete(tempId);
      messageIds.current.add(data.id);
      
      setMessages(prev => 
        prev.map(msg => msg.id === tempId ? { ...data } : msg)
          .sort((a, b) => a.created_at - b.created_at)
      );
      
      scheduleBottomSync('outgoing-image');
      
    } catch (error) {
      messageIds.current.delete(tempId);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setModal({
        isOpen: true,
        title: t.error,
        message: t.failedToSend,
      });
    }
  };

  if (loading && !hasCachedRoom) {
    return <LoadingScreen />;
  }

  if (!chat) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">{t.chatNotFound}</div>
      </div>
    );
  }

  const messageGroups = groupMessagesByDate(messages);
  const messageBackgroundStyle = chatBackground.background_type === 'image' && (chatBackgroundImageUrl || chatBackground.background_value)
    ? { backgroundImage: `url("${chatBackgroundImageUrl || chatBackground.background_value}")`, backgroundPosition: 'center center', backgroundSize: 'cover' }
    : chatBackground.background_type === 'gradient' && chatBackground.background_value in BACKGROUND_PRESETS
      ? { background: BACKGROUND_PRESETS[chatBackground.background_value as keyof typeof BACKGROUND_PRESETS].background }
      : undefined;
  const filteredForwardChats = forwardChats.filter(targetChat => {
    const query = forwardSearch.trim().toLowerCase();
    if (!query) return true;
    return getChatDisplay(targetChat).toLowerCase().includes(query);
  });
  const activeMenuMessageData = activeMessageMenu
    ? messages.find(message => message.id === activeMessageMenu) || null
    : null;

  return (
    <>
      <div className="relative flex h-screen min-h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="pointer-events-none absolute inset-0 z-0" style={messageBackgroundStyle} />
        {chatBackground.background_type !== 'default' && <div className="pointer-events-none absolute inset-0 z-0 bg-slate-950/20" />}

        {/* HEADER */}
        <div ref={headerRef} className="absolute inset-x-0 top-0 z-20 bg-white/5 backdrop-blur-sm border-b border-white/10 px-6 py-4">
          <div className="max-w-6xl mx-auto flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                onClick={() => navigate('/chat')}
                className="text-white hover:text-purple-300 transition-colors cursor-pointer p-2 rounded-lg hover:bg-white/10"
                title={t.back}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
              </button>
              {(isGroup || isChannel) ? (
                <div className="flex items-center gap-3">
                  <div 
                    className="cursor-pointer"
                    onClick={() => chat.avatar && setAvatarViewer(chat.avatar)}
                  >
                    <Avatar
                      isGroup={isGroup}
                      isChannel={isChannel}
                      size="lg"
                      src={chat.avatar || undefined}
                    />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div 
                      onClick={() => setParticipantsModal(true)}
                      className="cursor-pointer hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-xl font-semibold text-white break-words">
                          {chatName}
                        </h1>
                        {isCreator && (
                          <span className="text-yellow-400/80 text-sm" title={t.youAreCreator}>👑</span>
                        )}
                      </div>
                      <p className="text-xs text-purple-300">
                        {isGroup ? `${chat.participants?.length || 0} ${t.participants}` : `${chat.participants?.length || 0} ${t.subscribers}`}
                      </p>
                    </div>
                  </div>
                  
                  {isCreator && (isGroup || isChannel) && (
                    <button
                      onClick={() => {
                        setEditChatName(chatName);
                        setEditChatAvatar(chat.avatar || null);
                        setIsEditingChat(true);
                      }}
                      className="text-white/50 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
                      title={t.editChat}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17 3l4 4-7 7H10v-4l7-7z"/>
                        <path d="M4 20h16"/>
                      </svg>
                    </button>
                  )}
                  
                  {isCreator && isGroup && (
                    <button
                      onClick={() => setShowAddParticipants(true)}
                      className="text-white/50 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
                      title={t.addParticipants}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                    </button>
                  )}
                  
                  {!isCreator && (isGroup || isChannel) && (
                    <button
                      onClick={() => setLeaveConfirm(true)}
                      className="text-red-400/70 hover:text-red-400 transition p-1 rounded-lg hover:bg-white/10"
                      title={isGroup ? t.leaveGroup : t.unsubscribeChannel}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                    </button>
                  )}
                </div>
              ) : otherUser ? (
                <>
                  <div 
                    onClick={() => openUserProfile(otherUser.username)}
                    className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                    title={t.viewProfile}
                  >
                    <Avatar 
                      userId={otherUser.user_id}
                      name={getUserDisplayName(otherUser, t.userUnknown)}
                      size="lg" 
                      src={otherUser.avatar}
                    />
                    <h1 className="truncate text-xl font-semibold text-white">{chatName}</h1>
                  </div>
                  
                  {/* КНОПКА ЗВОНКА */}
                  <button
                    onClick={() => {
                      if (otherUser) {
                        handleCallUser(
                          otherUser.user_id,
                          getUserDisplayName(otherUser, t.userUnknown),
                          otherUser.avatar
                        );
                      }
                    }}
                    disabled={!canCall(otherUser?.user_id || '')}
                    className={`p-2 rounded-lg transition ${
                      canCall(otherUser?.user_id || '')
                        ? 'text-white/70 hover:text-white hover:bg-white/10 cursor-pointer'
                        : 'text-white/30 cursor-not-allowed'
                    }`}
                    title={t.videoCall}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M23 7l-7 5v-4a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-4l7 5V7z"/>
                      <rect x="2" y="5" width="14" height="14" rx="2" ry="2"/>
                    </svg>
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar 
                    userId={otherUser?.user_id}
                    name={getUserDisplayName(otherUser, t.userUnknown)}
                    size="lg" 
                  />
                  <h1 className="truncate text-xl font-semibold text-white">{chatName}</h1>
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 md:gap-4">
              {isPrivate && otherUser && <div className="relative"><button onClick={() => setShowSpaceMenu(v => !v)} className="flex h-9 w-9 items-center justify-center rounded-xl text-lg text-white/70 transition hover:bg-white/10 hover:text-white" title="Меню чата" aria-label="Меню чата">⋯</button>{showSpaceMenu && <div className="absolute right-0 top-11 z-40 w-64 rounded-2xl border border-white/15 bg-slate-900/95 p-2 shadow-2xl backdrop-blur-xl">{spaceState?.status === 'not_created' ? <button onClick={() => { setShowSpaceMenu(false); setShowCreateSpace(true); }} className="w-full rounded-xl px-3 py-3 text-left text-sm text-pink-100 hover:bg-white/10">Создать пространство вместе</button> : spaceState?.status === 'pending' && spaceState?.can_accept ? <button onClick={async () => { const r = await fetchWithAuth(`/spaces/${id}/accept-pending`, { method: 'POST' }); if (r.ok) { await refreshSpaceState(); setShowSpaceMenu(false); } }} className="w-full rounded-xl px-3 py-3 text-left text-sm text-pink-100 hover:bg-white/10">Принять приглашение</button> : spaceState?.status === 'pending' ? <p className="px-3 py-3 text-sm text-violet-200">Приглашение отправлено</p> : <><button onClick={() => { setShowSpaceMenu(false); navigate(`/chat/${id}/space`); }} className="w-full rounded-xl px-3 py-3 text-left text-sm text-pink-100 hover:bg-white/10">Наше пространство</button><button onClick={() => { setShowSpaceMenu(false); navigate(`/chat/${id}/space/dates`); }} className="w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Важные даты</button><button onClick={() => { setShowSpaceMenu(false); navigate(`/chat/${id}/space/memories`); }} className="w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Моменты</button><button onClick={() => { setShowSpaceMenu(false); navigate(`/chat/${id}/space/notes`); }} className="w-full rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10">Заметки и планы</button></>}</div>}</div>}
              {canChangeBackground && <button
                type="button"
                onClick={openBackgroundSettings}
                className="rounded-lg p-2 text-white/70 transition hover:bg-white/10 hover:text-white"
                title={t.changeChatBackground}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
                </svg>
              </button>}
              <UserMenu username={user?.username || ''} email={user?.email || ''} />
            </div>
          </div>
        </div>

        {spaceToast && <div className="pointer-events-none absolute inset-x-0 top-[calc(var(--chat-header-height,72px)+14px)] z-40 mx-auto w-fit max-w-[calc(100%-2rem)] rounded-full bg-slate-950/90 px-4 py-2 text-sm text-white shadow-xl backdrop-blur">{spaceToast}</div>}

        {/* MESSAGES */}
        <div className="absolute inset-0 z-10 overflow-hidden">
          <div
            ref={messagesScrollRef}
            onScroll={handleMessagesScroll}
            className="flex h-full w-full min-w-0 flex-col overflow-y-auto px-6"
            style={{
              paddingTop: 'calc(var(--chat-header-height, 0px) + 1rem)',
            }}
          >
            <div className="mx-auto flex min-h-full w-full min-w-0 max-w-4xl flex-col">
              {messages.length === 0 ? (
                <div className="text-center text-purple-300 py-8">
                  {t.noMessages}
                </div>
              ) : (
                messageGroups.map((group, groupIndex) => (
                  <div key={group.dateKey} className={`w-full min-w-0 ${groupIndex > 0 ? 'mt-6' : ''}`}>
                    <div className="flex justify-center my-4">
                      <div className="bg-white/10 backdrop-blur-sm px-4 py-1 rounded-full border border-white/10">
                        <span className="text-purple-300 text-xs font-medium">{group.dateLabel}</span>
                      </div>
                    </div>
                    
                    <div className="w-full min-w-0 space-y-3">
                      {group.messages.map((msg) => {
                        let formattedDate = '';
                        try {
                          const date = new Date(msg.created_at * 1000);
                          if (!isNaN(date.getTime())) {
                            formattedDate = date.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            });
                          }
                        } catch {
                          formattedDate = '';
                        }

                        const isOwn = msg.sender_id === user?.id;
                        const replyToMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
                        const imageUrls = parseImages(msg);
                        const messageText = (msg.content || '').trim();
                        const legacyImageText = msg.is_image && (
                          messageText.startsWith('/uploads/') || messageText.startsWith('["/uploads/')
                        );
                        const visibleMessageText = legacyImageText ? '' : messageText;
                        
                        const sender = chat?.participants?.find(p => p.user_id === msg.sender_id);
                        const senderName = getUserDisplayName(sender, t.userUnknown);
                        const isGroupChat = chat?.chat_type === 'group' || chat?.chat_type === 'channel';
                        const isDeleted = isMessageDeleted(msg);
                        const isVideoNote = msg.media?.type === 'video_note';
                        return (
                          <div
                            id={`message-${msg.id}`}
                            key={msg.id}
                            ref={msg.id === messages[messages.length - 1]?.id ? lastMessageRef : undefined}
                            className={`flex w-full min-w-0 ${isOwn ? 'justify-end' : 'justify-start'} scroll-mt-20`}
                          >
                            <div
                              className={`group relative flex max-w-[78%] flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                              data-message-menu-root
                              onPointerDown={(event) => handleMessagePointerDown(event, msg)}
                              onPointerMove={handleMessagePointerMove}
                              onPointerUp={(event) => handleMessagePointerEnd(event, msg)}
                              onPointerCancel={() => {
                                suppressMessageClickRef.current = false;
                                resetSwipeReply();
                              }}
                              style={{ touchAction: 'pan-y' }}
                            >
                              <div
                                onClick={(event) => handleMessageClick(event, msg)}
                                className={`max-w-full transition-transform duration-150 ${isVideoNote
                                  ? 'overflow-visible rounded-none bg-transparent text-white'
                                  : `${isOwn ? 'bg-gradient-to-r from-purple-500/80 to-pink-500/80' : 'bg-white/10'} overflow-hidden rounded-2xl text-white`
                                }`}
                                style={{
                                  transform: swipeState.messageId === msg.id ? `translateX(${swipeState.offset}px)` : 'translateX(0px)',
                                }}
                              >
                                <div className={isVideoNote ? 'p-0' : 'px-4 py-2'}>
                                  {!isOwn && isGroupChat && (
                                    <div className={`flex items-center gap-2 ${isVideoNote ? 'mb-2 rounded-lg bg-black/25 px-2 py-1 backdrop-blur-sm' : 'mb-2 border-b border-white/10 pb-1'}`}>
                                      {sender?.avatar ? (
                                        <img 
                                          src={sender.avatar} 
                                          alt={senderName} 
                                          className="w-5 h-5 rounded-full object-cover cursor-pointer"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            if (sender?.username) openUserProfile(sender.username);
                                          }}
                                        />
                                      ) : (
                                        <span data-message-interactive onClick={(event) => event.stopPropagation()}>
                                          <Avatar 
                                            userId={sender?.user_id}
                                            name={senderName}
                                            size="xs" 
                                          />
                                        </span>
                                      )}
                                      <span 
                                        data-message-interactive
                                        className="text-xs font-medium text-purple-300 cursor-pointer hover:text-purple-200 transition"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          if (sender?.username) openUserProfile(sender.username);
                                        }}
                                      >
                                        {senderName}
                                      </span>
                                    </div>
                                  )}

                                  {replyToMsg && (
                                    <div 
                                      data-message-interactive
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        scrollToMessage(replyToMsg.id);
                                      }}
                                      className={`${isVideoNote ? 'mb-2 rounded-lg bg-black/25 px-2 py-1 backdrop-blur-sm' : 'mb-2 border-l-2 border-purple-400 pb-1 pl-2'} text-xs opacity-60 cursor-pointer hover:opacity-100 transition`}
                                      title={t.goToMessage}
                                    >
                                      <span className="font-medium">{t.replyToMessage}</span>
                                      <p className="truncate">
                                        {getMessagePreview(replyToMsg)}
                                      </p>
                                    </div>
                                  )}

                                  {msg.forwarded_from_user_name && (
                                    <div className={`${isVideoNote ? 'mb-2 rounded-lg bg-black/25 px-2 py-1 backdrop-blur-sm' : 'mb-2'} text-xs text-purple-200/80`}>
                                      {t.forwardedFrom} <span className="font-medium">{msg.forwarded_from_user_name}</span>
                                    </div>
                                  )}

                                  {isDeleted ? (
                                    <p className="text-sm italic text-white/70">{t.messageDeleted}</p>
                                  ) : msg.media?.type === 'voice' ? (
                                    <VoiceMessage src={msg.media.url} duration={msg.media.duration} waveform={msg.media.waveform} />
                                  ) : msg.media?.type === 'video_note' ? (
                                    <VideoNote src={msg.media.url} duration={msg.media.duration} poster={msg.media.thumbnail_url} />
                                  ) : imageUrls.length > 0 ? (
                                    <>
                                      <div className={`grid ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-1 max-w-[300px]`}>
                                        {imageUrls.map((url, idx) => (
                                          <img 
                                            key={idx}
                                            src={url} 
                                            alt={`image ${idx + 1}`} 
                                            className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              openImageViewer(imageUrls, idx);
                                            }}
                                          />
                                        ))}
                                      </div>
                                      {visibleMessageText && (
                                        <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere mt-2">
                                          {visibleMessageText}
                                        </p>
                                      )}
                                    </>
                                  ) : msg.is_sticker ? (
                                    <span className="text-6xl block leading-none break-keep">{msg.content}</span>
                                  ) : (
                                    <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere">
                                      {msg.content}
                                    </p>
                                  )}

                                  <div className={`${isVideoNote ? 'mt-1 ml-auto w-fit rounded-lg bg-black/30 px-1.5 py-0.5 backdrop-blur-sm' : 'mt-2'} flex items-center justify-end gap-2`}>
                                    <p className="text-xs opacity-70">
                                      {formattedDate}
                                      {msg.edited_at ? ` · ${t.messageEdited}` : ''}
                                    </p>
                                    {isOwn && (
                                      <span className="text-xs opacity-70">
                                        {msg.is_read ? '✓✓' : '✓'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {!isCompactViewport && activeMessageMenu === msg.id && !isDeleted && (
                                <div
                                  className={`absolute top-2 z-30 w-52 rounded-2xl border border-purple-300/20 bg-gradient-to-br from-purple-950/95 via-violet-950/95 to-fuchsia-950/95 p-2 shadow-2xl shadow-purple-950/50 backdrop-blur-xl ${isOwn ? 'right-2' : 'left-2'}`}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <div className="mb-2 flex flex-wrap gap-1 border-b border-white/10 pb-2">
                                    {ALLOWED_REACTIONS.map((emoji) => (
                                      <button
                                        key={emoji}
                                        type="button"
                                        onClick={() => handleReactionToggle(msg, emoji)}
                                        className={`flex h-9 w-9 items-center justify-center rounded-full text-base transition ${
                                          msg.reactions?.some(reaction => reaction.emoji === emoji && reaction.reacted_by_me)
                                          ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30'
                                            : 'border border-white/10 bg-white/10 hover:bg-purple-500/30'
                                        }`}
                                        title={emoji}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="space-y-1">
                                    {canReply() && (
                                      <button type="button" onClick={() => handleReply(msg)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/90 transition hover:bg-purple-500/25">
                                        <ReplyIcon />
                                        <span>{t.reply}</span>
                                      </button>
                                    )}
                                    <button type="button" onClick={() => openForwardModal(msg)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/90 transition hover:bg-purple-500/25">
                                      <ForwardIcon />
                                      <span>{t.forward}</span>
                                    </button>
                                    {isPrivate && spaceState?.status === 'active' && imageUrls.length > 0 && (
                                      <button type="button" onClick={() => void toggleMoment(msg)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-pink-100 transition hover:bg-purple-500/25">
                                        <span>♡</span><span>{savedMemoryIds.has(msg.id) ? 'Убрать из моментов' : 'Сохранить момент'}</span>
                                      </button>
                                    )}
                                    {canEditMessage(msg) && (
                                      <button type="button" onClick={() => startEditingMessage(msg)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/90 transition hover:bg-purple-500/25">
                                        <EditIcon />
                                        <span>{t.editMessage}</span>
                                      </button>
                                    )}
                                    {canDeleteMessage(msg) && (
                                      <button type="button" onClick={() => requestDeleteMessage(msg)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-red-300 transition hover:bg-red-500/10 hover:text-red-200">
                                        <DeleteIcon />
                                        <span>{t.deleteMessage}</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}

                              {!isDeleted && msg.reactions && msg.reactions.length > 0 && (
                                <div className={`mt-1 flex max-w-full flex-wrap gap-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                  {msg.reactions.map((reaction) => (
                                    <button
                                      key={reaction.emoji}
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleReactionToggle(msg, reaction.emoji);
                                      }}
                                      className={`rounded-full border px-2 py-0.5 text-xs leading-5 text-white shadow-sm backdrop-blur-sm transition ${
                                        reaction.reacted_by_me
                                          ? 'border-purple-300/70 bg-purple-500/50'
                                          : 'border-white/10 bg-white/10 hover:bg-white/20'
                                      }`}
                                      title={reaction.emoji}
                                    >
                                      <span className="mr-1">{reaction.emoji}</span>
                                      <span>{reaction.count}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              {chat?.chat_type === 'channel' && !isDeleted && (
                                <button type="button" onClick={() => openComments(msg)} className="mt-1 text-xs text-purple-200 transition hover:text-white">💬 {msg.comments_count ? msg.comments_count : 'Комментировать'}</button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <div className="mt-auto" />
              <div
                ref={messagesEndRef}
                aria-hidden="true"
                className="pointer-events-none shrink-0"
                style={{ height: 'calc(var(--chat-composer-height, 0px) + 1rem)' }}
              />
            </div>
          </div>
        </div>

        {/* INPUT */}
        {canSendMessages() ? (
          <div ref={composerRef} className="absolute inset-x-0 bottom-0 z-20 bg-white/5 backdrop-blur-sm border-t border-white/10 px-4 py-3 md:px-6 md:py-4">
            <form onSubmit={sendMessage} className="max-w-4xl mx-auto">
              {editingMessage ? (
                <div className="mb-2 flex items-center justify-between rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2">
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="text-xs text-amber-200">{t.editingMessage}</p>
                    <p className="truncate text-sm text-white">{getMessagePreview(editingMessage)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    className="ml-2 flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                    title={t.cancelEdit}
                  >
                    ×
                  </button>
                </div>
              ) : replyTo && (
                <div className="mb-2 p-2 bg-purple-500/20 rounded-lg flex justify-between items-center">
                  <div 
                    className="flex-1 cursor-pointer hover:opacity-80 transition overflow-hidden"
                    onClick={() => scrollToMessage(replyTo.id)}
                    title={t.goToMessage}
                  >
                    <p className="text-xs text-purple-300">{t.replyToMessage}</p>
                    <p className="text-sm text-white truncate max-w-[300px] md:max-w-[500px]">
                      {getMessagePreview(replyTo)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelReply}
                    className="text-white/60 hover:text-white text-xl ml-2 flex-shrink-0"
                  >
                    ×
                  </button>
                </div>
              )}
              {selectedImages.previews.length > 0 && (
                <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                  {selectedImages.previews.map((preview, idx) => (
                    <div key={preview} className="relative flex-shrink-0">
                      <img
                        src={preview}
                        alt={`${t.preview} ${idx + 1}`}
                        className="w-16 h-16 object-cover rounded-lg border border-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => removeSelectedImage(idx)}
                        disabled={isSending}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/80 text-white text-xs leading-none flex items-center justify-center hover:bg-red-500 disabled:opacity-50"
                        title={t.cancel}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-center">
                {recording ? (
                  <div className="flex w-full min-w-0 flex-1 items-center gap-3 rounded-2xl border border-pink-300/20 bg-gradient-to-r from-pink-500/25 to-violet-500/25 px-3 py-2 text-white backdrop-blur-xl">
                    <button type="button" onClick={discardRecording} aria-label={language === 'ru' ? 'Отменить' : 'Cancel'} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-white/10"><DeleteIcon /></button>
                    {recording === 'video_note' && <video ref={liveVideoRef} muted autoPlay playsInline className="h-14 w-14 shrink-0 rounded-full border-2 border-pink-300 object-cover"/>}
                    <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-pink-400"/><span className="tabular-nums">{String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}</span>
                    {recording === 'voice' ? <span className="flex h-7 flex-1 items-center justify-center gap-1">{[12,22,16,28,18,24,13].map((h, i) => <i key={i} className="w-1 animate-pulse rounded-full bg-pink-200" style={{height:h, animationDelay:`${i * 90}ms`}}/>)}</span> : <span className="min-w-0 flex-1 text-sm text-pink-100">{language === 'ru' ? 'Видеосообщение' : 'Video message'}</span>}
                    <button type="button" onClick={stopRecording} aria-label={language === 'ru' ? 'Остановить запись' : 'Stop recording'} className="ml-auto grid h-10 w-10 place-items-center rounded-xl bg-white/15 hover:bg-white/25"><span className="h-3 w-3 rounded-sm bg-white"/></button>
                  </div>
                ) : recorded ? (
                  <div className="flex w-full min-w-0 flex-1 items-center gap-2 rounded-2xl border border-purple-300/20 bg-purple-500/20 px-2 py-2 text-white backdrop-blur-xl">
                    <button type="button" onClick={discardRecording} disabled={recorderState === 'uploading' || recorderState === 'sending'} aria-label={language === 'ru' ? 'Удалить запись' : 'Delete recording'} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl hover:bg-white/10"><DeleteIcon /></button>
                    {recorded.type === 'voice' ? <VoiceMessage src={recorded.url} duration={recorded.duration} variant="preview" className="min-w-0 flex-1" /> : <div className="flex min-w-0 flex-1 items-center gap-3"><VideoNote src={recorded.url} duration={recorded.duration} className="h-16 w-16 shrink-0 sm:h-20 sm:w-20" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{language === 'ru' ? 'Видеосообщение' : 'Video message'}</p><p className="text-xs text-purple-100">{Math.floor(recorded.duration / 60)}:{String(Math.floor(recorded.duration % 60)).padStart(2, '0')}</p>{recorderState === 'error' && <p className="mt-1 text-xs text-pink-200">⚠ {language === 'ru' ? 'Не удалось отправить' : 'Unable to send'}</p>}{(recorderState === 'uploading' || recorderState === 'sending') && <p className="mt-1 text-xs text-purple-100">{recorderState === 'uploading' ? (uploadProgress >= 100 ? (language === 'ru' ? 'Обработка…' : 'Processing…') : `${language === 'ru' ? 'Загрузка' : 'Uploading'} ${uploadProgress}%`) : (language === 'ru' ? 'Отправка…' : 'Sending…')}</p>}</div></div>}
                    {recorded.type === 'voice' && recorderState === 'error' && <span className="shrink-0 text-xs text-pink-200">⚠ {language === 'ru' ? 'Не удалось отправить' : 'Unable to send'}</span>}
                    {recorded.type === 'voice' && (recorderState === 'uploading' || recorderState === 'sending') && <span className="shrink-0 text-xs text-purple-100">{recorderState === 'uploading' ? (uploadProgress >= 100 ? (language === 'ru' ? 'Обработка…' : 'Processing…') : `${language === 'ru' ? 'Загрузка' : 'Uploading'} ${uploadProgress}%`) : (language === 'ru' ? 'Отправка…' : 'Sending…')}</span>}
                    <button type="button" disabled={recorderState === 'uploading' || recorderState === 'sending'} onClick={() => void sendRecorded()} aria-label={recorderState === 'error' ? (language === 'ru' ? 'Повторить' : 'Retry') : (language === 'ru' ? 'Отправить' : 'Send')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 disabled:opacity-50"><svg viewBox="0 0 24 24" className="h-5 w-5 fill-current"><path d="m3 3 18 9-18 9 4-9z"/></svg></button>
                  </div>
                ) : null}
                {!recording && !recorded && !editingMessage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowStickerPicker(!showStickerPicker)}
                      className="flex-shrink-0 w-10 h-10 bg-white/10 rounded-xl hover:bg-white/20 transition flex items-center justify-center"
                      title={t.stickers}
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="20" 
                        height="20" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2" 
                        strokeLinecap="round" 
                        strokeLinejoin="round"
                        className="text-white"
                      >
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
                        <line x1="9" y1="9" x2="9.01" y2="9"/>
                        <line x1="15" y1="9" x2="15.01" y2="9"/>
                      </svg>
                    </button>

                    <ImageUploader
                      isUploading={isSending && selectedImages.files.length > 0}
                      selectedCount={selectedImages.files.length}
                      onImagesSelected={handleImagesSelected}
                      onError={handleImageError}
                    />
                  </>
                )}
                
                {!recording && !recorded && <>
                <input
                  ref={messageInputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={t.enterMessage}
                  className="flex-1 min-w-0 px-3 py-2 md:px-4 md:py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all text-sm md:text-base"
                />
                
                {!editingMessage && !newMessage.trim() && !selectedImages.files.length ? (
                  <button type="button" onPointerDown={onMediaPointerDown} onPointerUp={onMediaPointerUp} onPointerCancel={clearMediaLongPress} onPointerLeave={clearMediaLongPress} onContextMenu={event => event.preventDefault()} aria-label={mediaMode === 'voice' ? (language === 'ru' ? 'Голосовое: удерживайте для записи, нажмите для видеорежима' : 'Voice: hold to record, tap for video mode') : (language === 'ru' ? 'Видеосообщение: удерживайте для записи, нажмите для голосового режима' : 'Video note: hold to record, tap for voice mode')} className="flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition active:scale-95 hover:bg-purple-500/30">
                    {mediaMode === 'voice' ? <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2"><circle cx="12" cy="12" r="8"/><path d="m10 8 6 4-6 4z"/></svg>}
                  </button>
                ) : <button type="submit" disabled={isSending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 hover:bg-white/20" title={editingMessage ? t.saveChanges : t.send}><img src="/favicon-96x96.png" alt={editingMessage ? t.saveChanges : t.send} className="h-10 w-10 object-contain" /></button>}
                </>}
              </div>
            </form>
          </div>
        ) : (
          <div ref={composerRef} className="absolute inset-x-0 bottom-0 z-20 bg-white/5 backdrop-blur-sm border-t border-white/10 px-4 py-4 md:px-6 md:py-4">
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-purple-300 text-sm">
                📢 {t.channelOnlyCreatorCanSend}
              </p>
            </div>
          </div>
        )}
      </div>

      {id && <CreateSpaceModal open={showCreateSpace} chatId={id} me={user} other={otherUser} onClose={() => setShowCreateSpace(false)} onCreated={refreshSpaceState} />}

      {isCompactViewport && activeMenuMessageData && !isMessageDeleted(activeMenuMessageData) && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" onClick={() => setActiveMessageMenu(null)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-purple-300/20 bg-gradient-to-br from-purple-950/95 via-violet-950/95 to-fuchsia-950/95 p-4 shadow-2xl shadow-purple-950/50 backdrop-blur-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-white/20" />
            <div className="mb-4 flex flex-wrap gap-2">
              {ALLOWED_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReactionToggle(activeMenuMessageData, emoji)}
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-lg transition ${
                    activeMenuMessageData.reactions?.some(reaction => reaction.emoji === emoji && reaction.reacted_by_me)
                      ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30'
                      : 'border border-white/10 bg-white/10 hover:bg-purple-500/30'
                  }`}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              {canReply() && (
                <button type="button" onClick={() => handleReply(activeMenuMessageData)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-white/90 transition hover:bg-white/10">
                  <ReplyIcon />
                  <span>{t.reply}</span>
                </button>
              )}
              <button type="button" onClick={() => openForwardModal(activeMenuMessageData)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-white/90 transition hover:bg-white/10">
                <ForwardIcon />
                <span>{t.forward}</span>
              </button>
              {isPrivate && spaceState?.status === 'active' && parseImages(activeMenuMessageData).length > 0 && (
                <button type="button" onClick={() => void toggleMoment(activeMenuMessageData)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-pink-100 transition hover:bg-white/10">
                  <span>♡</span><span>{savedMemoryIds.has(activeMenuMessageData.id) ? 'Убрать из моментов' : 'Сохранить момент'}</span>
                </button>
              )}
              {canEditMessage(activeMenuMessageData) && (
                <button type="button" onClick={() => startEditingMessage(activeMenuMessageData)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-white/90 transition hover:bg-white/10">
                  <EditIcon />
                  <span>{t.editMessage}</span>
                </button>
              )}
              {canDeleteMessage(activeMenuMessageData) && (
                <button type="button" onClick={() => requestDeleteMessage(activeMenuMessageData)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-red-300 transition hover:bg-red-500/10 hover:text-red-200">
                  <DeleteIcon />
                  <span>{t.deleteMessage}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {commentsMessage && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 md:items-center" onClick={() => setCommentsMessage(null)}>
          <div className="max-h-[88vh] w-full max-w-lg rounded-t-3xl border border-purple-300/20 bg-gradient-to-br from-purple-950/95 via-violet-950/95 to-fuchsia-950/95 p-4 text-white shadow-2xl shadow-purple-950/50 backdrop-blur-xl md:rounded-3xl" onClick={event => event.stopPropagation()}>
            <div className="mb-3 flex items-start gap-3 border-b border-purple-300/20 pb-3"><div className="min-w-0 flex-1"><p className="text-base font-semibold">Комментарии</p><div className="mt-2 flex gap-2">{parseImages(commentsMessage).slice(0, 3).map((url, index) => <img key={url} src={url} onClick={() => openImageViewer(parseImages(commentsMessage), index)} className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/15" />)}{(commentsMessage.content || '').trim() && <p className="line-clamp-2 text-sm text-white/70">{commentsMessage.content}</p>}</div></div><button onClick={() => setCommentsMessage(null)} className="rounded-full bg-white/10 px-2 py-1 text-white/70 hover:bg-white/20">×</button></div>
            <div className="max-h-[48vh] space-y-2 overflow-y-auto">{comments.map(comment => <div key={comment.id} className="rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm backdrop-blur-sm"><span className="mr-2 font-medium text-purple-200">{getUserDisplayName(comment, t.userUnknown)}</span>{comment.deleted_at ? <i className="text-white/50">Комментарий удалён</i> : <span className="text-white">{comment.content}</span>}{comment.edited_at ? <span className="ml-2 text-xs text-white/50">изменено</span> : null}</div>)}</div>
            <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); void sendComment(); }}><input value={commentText} onChange={event => setCommentText(event.target.value)} placeholder="Написать комментарий..." className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-white placeholder-purple-200/50 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-500/40"/><button className="rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 font-medium shadow-lg shadow-purple-500/25 transition hover:opacity-90">→</button></form>
          </div>
        </div>
      )}

      {deleteConfirmMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/95 p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-white">{t.confirmDeleteMessage}</h3>
            <p className="mt-2 text-sm text-white/70">{getMessagePreview(deleteConfirmMessage)}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirmMessage(null)} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10">
                {t.cancel}
              </button>
              <button type="button" onClick={confirmDeleteMessage} className="rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600">
                {t.deleteMessage}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBackgroundSettings && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/60 p-3 backdrop-blur-sm md:items-center md:justify-center" onClick={() => !savingBackground && setShowBackgroundSettings(false)}>
          <div className="w-full max-w-md rounded-t-3xl border border-purple-300/20 bg-gradient-to-br from-slate-900 via-purple-950 to-fuchsia-950 p-5 text-white shadow-2xl md:rounded-3xl" onClick={event => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t.chatBackground}</h2>
              <button type="button" onClick={() => !savingBackground && setShowBackgroundSettings(false)} className="text-2xl text-white/60 hover:text-white">×</button>
            </div>
            <div className="mb-4 h-32 overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900" style={
              pendingBackground.background_type === 'image' && backgroundPreview ? { backgroundImage: `url("${backgroundPreview}")`, backgroundPosition: 'center', backgroundSize: 'cover' } :
              pendingBackground.background_type === 'gradient' && pendingBackground.background_value in BACKGROUND_PRESETS ? { background: BACKGROUND_PRESETS[pendingBackground.background_value as keyof typeof BACKGROUND_PRESETS].background } : undefined
            }>
              <div className="h-full w-full bg-slate-950/20" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => { setPendingBackground(DEFAULT_CHAT_BACKGROUND); setBackgroundImageFile(null); setBackgroundPreview(null); }} className={`relative flex h-16 items-center justify-center rounded-xl border p-3 text-center text-sm font-medium transition ${pendingBackground.background_type === 'default' ? 'border-purple-200 bg-purple-500/30 ring-2 ring-pink-400/70 shadow-lg shadow-purple-500/20' : 'border-white/10 bg-white/10 hover:border-purple-200/50 hover:bg-white/15'}`}>{t.backgroundDefault}{pendingBackground.background_type === 'default' && <span className="absolute right-2 top-1.5 text-xs">✓</span>}</button>
              {Object.entries(BACKGROUND_PRESETS).map(([preset, config]) => (
                <button key={preset} type="button" onClick={() => { setPendingBackground({ background_type: 'gradient', background_value: preset }); setBackgroundImageFile(null); setBackgroundPreview(null); }} className={`relative flex h-16 items-center justify-center overflow-hidden rounded-xl border px-2 text-center text-sm font-medium text-white transition ${pendingBackground.background_type === 'gradient' && pendingBackground.background_value === preset ? 'border-purple-200 ring-2 ring-pink-400/80 shadow-lg shadow-purple-500/30' : 'border-white/15 hover:border-purple-200/60 hover:brightness-110'}`} style={{ background: config.background }}>
                  <span className="relative z-10 rounded-md bg-slate-950/25 px-1.5 py-0.5 text-shadow-sm">{t[config.labelKey]}</span>
                  {pendingBackground.background_type === 'gradient' && pendingBackground.background_value === preset && <span className="absolute right-2 top-1.5 z-10 text-xs">✓</span>}
                </button>
              ))}
            </div>
            <label htmlFor="chat-background-upload" className="mt-3 flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-purple-300/40 bg-white/5 px-4 py-3 text-sm text-purple-100 transition hover:bg-white/10">
              {t.chooseBackgroundImage}
            </label>
            <input id="chat-background-upload" type="file" accept="image/*" className="hidden" disabled={savingBackground} onChange={event => { const file = event.target.files?.[0]; if (file) selectBackgroundImage(file); event.currentTarget.value = ''; }} />
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={savingBackground} onClick={() => void saveBackground()} className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 font-medium transition hover:opacity-90 disabled:opacity-50">{savingBackground ? t.loading : t.applyBackground}</button>
              <button type="button" disabled={savingBackground} onClick={() => { setPendingBackground(DEFAULT_CHAT_BACKGROUND); void saveBackground(DEFAULT_CHAT_BACKGROUND); }} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm transition hover:bg-white/20 disabled:opacity-50">{t.resetBackground}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ОСТАЛЬНЫЕ МОДАЛКИ ===== */}
      {/* Participants Modal */}
      {participantsModal && chat && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                {isGroup ? t.participants : t.subscribers}
              </h2>
              <button
                onClick={() => setParticipantsModal(false)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            <div className="space-y-2">
              {chat.participants?.map((participant) => {
                const isCreatorUser = participant.user_id === chat.created_by;
                const canRemove = canManageParticipants() && participant.user_id !== user?.id;
                
                return (
                  <div
                    key={participant.user_id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white/10 hover:bg-white/20 transition"
                  >
                    <div 
                      className="flex items-center gap-3 flex-1 cursor-pointer"
                      onClick={() => {
                        setParticipantsModal(false);
                        openUserProfile(participant.username);
                      }}
                    >
                      <Avatar 
                        userId={participant.user_id}
                        name={getUserDisplayName(participant, t.userUnknown)}
                        size="md"
                        src={participant.avatar}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                        <p className="text-white font-medium">{getUserDisplayName(participant, t.userUnknown)}</p>
                        {isCreatorUser && (
                          <span className="text-yellow-400/80 text-sm" title={t.youAreCreator}>👑</span>
                        )}
                        </div>
                        {getUserUsernameLabel(participant) && <p className="text-xs text-purple-300">{getUserUsernameLabel(participant)}</p>}
                      </div>
                    </div>
                    {canRemove && (
                      <button
                        onClick={() => setRemoveConfirm({ userId: participant.user_id, username: participant.username, displayName: getUserDisplayName(participant, t.userUnknown) })}
                        className="text-red-400/70 hover:text-red-400 transition p-1 rounded-lg hover:bg-white/10"
                        title={isGroup ? t.removeFromGroup : t.unsubscribeFromChannel}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {canManageParticipants() && isGroup && (
              <button
                onClick={() => {
                  setParticipantsModal(false);
                  setShowAddParticipants(true);
                }}
                className="w-full mt-4 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 transition cursor-pointer"
              >
                + {t.addParticipants}
              </button>
            )}
            <button
              onClick={() => setParticipantsModal(false)}
              className="w-full mt-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
            >
              {t.close}
            </button>
          </div>
        </div>
      )}

      {/* Remove Confirm Modal */}
      {removeConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-red-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {isGroup ? t.removeParticipant : t.unsubscribeSubscriber}
              </h2>
              <p className="text-purple-200">
                {t.confirmRemovePrefix} <span className="font-semibold text-white">{removeConfirm.displayName}</span>
                {isGroup ? t.confirmRemoveGroupSuffix : t.confirmRemoveChannelSuffix}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => removeParticipant(removeConfirm.userId, removeConfirm.username)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
              >
                {isGroup ? t.delete : t.unsubscribeChannel}
              </button>
              <button
                onClick={() => setRemoveConfirm(null)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Confirm Modal */}
      {leaveConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-red-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="red" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {isGroup ? t.leaveGroup : t.unsubscribeChannel}
              </h2>
              <p className="text-purple-200">
                {isGroup ? t.leaveGroupConfirm : t.unsubscribeChannelConfirm}
                {isGroup && ` ${t.leaveGroupNote}`}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={leaveChat}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
              >
                {isGroup ? t.leaveGroup : t.unsubscribeChannel}
              </button>
              <button
                onClick={() => setLeaveConfirm(false)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Participants Modal */}
      {showAddParticipants && isGroup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">{t.addParticipants}</h2>
              <button
                onClick={() => {
                  setShowAddParticipants(false);
                  setSearchQuery('');
                }}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchUsers}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
            />
            
            <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
              {filteredUsers.length === 0 ? (
                <p className="text-purple-300 text-center py-4">
                  {searchQuery ? t.userNotFoundShort : t.noAvailableUsers}
                </p>
              ) : (
                filteredUsers.map(u => (
                  <div
                    key={u.id}
                    onClick={() => addParticipants([u.id])}
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/10 hover:bg-white/20 transition cursor-pointer"
                  >
                    <Avatar 
                      userId={u.id}
                      name={getUserDisplayName(u, t.userUnknown)}
                      size="md"
                      src={u.avatar}
                    />
                    <div><p className="text-white font-medium">{getUserDisplayName(u, t.userUnknown)}</p>{getUserUsernameLabel(u) && <p className="text-xs text-purple-300">{getUserUsernameLabel(u)}</p>}</div>
                  </div>
                ))
              )}
            </div>
            
            <button
              onClick={() => {
                setShowAddParticipants(false);
                setSearchQuery('');
              }}
              className="w-full px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Edit Chat Modal */}
      {isEditingChat && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                {t.editChat} {isGroup ? t.groupChat : t.channelChat}
              </h2>
              <button
                onClick={() => setIsEditingChat(false)}
                className="text-white/60 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="flex justify-center mb-4">
              <div className="relative">
                <div 
                  className="cursor-pointer"
                  onClick={() => editChatAvatar && setAvatarViewer(editChatAvatar)}
                >
                  <Avatar
                    isGroup={isGroup}
                    isChannel={isChannel}
                    name={editChatName}
                    size="xl"
                    src={editChatAvatar || undefined}
                  />
                </div>
                <label
                  htmlFor="chat-avatar-upload"
                  className="absolute bottom-0 right-0 bg-purple-500 rounded-full p-1.5 cursor-pointer hover:bg-purple-600 transition shadow-lg"
                  title={t.uploadAvatar}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                </label>
                <input
                  id="chat-avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarFileSelect(file);
                  }}
                  disabled={uploadingAvatar}
                />
              </div>
            </div>
            
            <input
              type="text"
              value={editChatName}
              onChange={(e) => setEditChatName(e.target.value)}
              placeholder={t.name}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
            />
            
            <div className="flex gap-3">
              <button
                onClick={() => updateChat(editChatName, editChatAvatar)}
                disabled={!editChatName.trim() || uploadingAvatar}
                className={`flex-1 px-4 py-2 rounded-lg transition ${
                  editChatName.trim() && !uploadingAvatar
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 cursor-pointer'
                    : 'bg-white/20 text-white/50 cursor-not-allowed'
                }`}
              >
                {uploadingAvatar ? t.loading : t.save}
              </button>
              <button
                onClick={() => setIsEditingChat(false)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Avatar Viewer */}
      {avatarViewer && (
        <ImageViewer
          images={[avatarViewer]}
          initialIndex={0}
          onClose={() => setAvatarViewer(null)}
        />
      )}

      {/* Sticker Picker */}
      {showStickerPicker && (
        <StickerPicker
          onSelectSticker={handleSendSticker}
          onClose={() => setShowStickerPicker(false)}
        />
      )}

      {/* Image Viewer */}
      {viewerImages && (
        <ImageViewer
          images={viewerImages}
          initialIndex={viewerIndex}
          onClose={() => setViewerImages(null)}
        />
      )}

      {/* Forward Chat Picker */}
      {forwardMessage && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-5 w-full max-w-md mx-4 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{t.forwardMessage}</h2>
              <button
                onClick={closeForwardModal}
                disabled={!!forwardSendingChatId}
                className="text-white/60 hover:text-white text-2xl disabled:opacity-40"
                title={t.close}
              >
                ×
              </button>
            </div>

            <input
              type="text"
              value={forwardSearch}
              onChange={(event) => setForwardSearch(event.target.value)}
              placeholder={t.searchChats}
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
            />

            <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
              {forwardLoading ? (
                <div className="py-8 text-center text-purple-200">{t.loading}</div>
              ) : filteredForwardChats.length === 0 ? (
                <div className="py-8 text-center text-purple-200">{t.noChats}</div>
              ) : (
                filteredForwardChats.map((targetChat) => {
                  const avatarProps = getChatAvatarProps(targetChat);
                  const displayName = getChatDisplay(targetChat);
                  const isSendingToChat = forwardSendingChatId === targetChat.id;

                  return (
                    <button
                      key={targetChat.id}
                      type="button"
                      onClick={() => handleForwardToChat(targetChat.id)}
                      disabled={!!forwardSendingChatId}
                      className="w-full flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left hover:bg-white/10 transition disabled:opacity-60"
                    >
                      <Avatar
                        userId={avatarProps.userId}
                        name={avatarProps.name}
                        src={avatarProps.src}
                        isGroup={avatarProps.isGroup}
                        isChannel={avatarProps.isChannel}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{displayName}</div>
                        <div className="text-xs text-purple-300">
                          {targetChat.chat_type === 'private' ? t.privateChat : targetChat.chat_type === 'group' ? t.groupChat : t.channelChat}
                        </div>
                      </div>
                      <span className="text-sm text-purple-200">
                        {isSendingToChat ? t.sending : t.forward}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              onClick={closeForwardModal}
              disabled={!!forwardSendingChatId}
              className="mt-4 w-full px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition disabled:opacity-40"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                modal.title === t.success 
                  ? 'bg-green-500/20' 
                  : 'bg-red-500/20'
              }`}>
                {modal.title === t.success ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="green" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5"/>
                  </svg>
                ) : (
                  <span className="text-3xl">⚠️</span>
                )}
              </div>
              <h2 className="text-2xl font-bold text-white">{modal.title}</h2>
              <p className="text-purple-200 mt-2">{modal.message}</p>
            </div>
            <button
              onClick={closeModal}
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition"
            >
              {t.ok}
            </button>
          </div>
        </div>
      )}
      
      {/* ===== ВИДЕО ЗВОНОК (ПОСЛЕ ПРИНЯТИЯ) ===== */}
      <VideoCallModal
        isOpen={isCallModalOpen}
        localStream={localStream}
        remoteStream={remoteStream}
        isCallActive={isCallActive}
        isCalling={isCalling}
        targetUserName={targetUser?.name}
        targetUserAvatar={targetUser?.avatar}
	        onEndCall={() => {
	          console.log('📞 [ChatRoom] Ending call from modal');
	          if (targetUser) {
	            endCall(targetUser.id, false, isCalling && !isCallActive ? 'cancel_call' : 'end_call');
	          }
	          handleCloseModal();
	        }}
	        onClose={() => {
	          console.log('📞 [ChatRoom] Closing modal');
	          if ((isCallActive || isCalling) && targetUser) {
	            endCall(targetUser.id, false, isCalling && !isCallActive ? 'cancel_call' : 'end_call');
	          }
	          handleCloseModal();
	        }}
      />
    </>
  );
}
