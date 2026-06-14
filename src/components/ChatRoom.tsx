import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../lib/redux/hooks';
import { fetchWithAuth } from '../lib/api';
import { socket } from '../lib/socket';
import StickerPicker from './StickerPicker';
import LoadingScreen from './LoadingScreen';
import { translations } from '../lib/locales';
import type { Message } from '../types/message';
import type { ChatInfo } from '../types/chat';
import type { User } from '../types/user';
import UserMenu from './UserMenu';
import ImageUploader from './ImageUploader';
import ImageViewer from './ImageViewer';
import Avatar from './Avatar';

export default function ChatRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, language } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
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
  const [removeConfirm, setRemoveConfirm] = useState<{ userId: string; username: string } | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;
  const isMounted = useRef(true);
  const messageIds = useRef<Set<string>>(new Set());

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

  const canManageParticipants = () => {
    if (!chat || !user) return false;
    if (chat.chat_type === 'group' || chat.chat_type === 'channel') {
      return chat.created_by === user.id;
    }
    return false;
  };

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  const cancelReply = () => {
    setReplyTo(null);
  };

  const openUserProfile = (userId: string) => {
    if (userId === user?.id) {
      navigate('/profile');
    } else {
      navigate(`/user/${userId}`);
    }
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

  const parseImages = (msg: Message): string[] => {
    if (msg.images && Array.isArray(msg.images)) {
      return msg.images;
    }
    if (msg.images && typeof msg.images === 'string') {
      try {
        const parsed = JSON.parse(msg.images);
        if (Array.isArray(parsed)) return parsed;
      } catch(e) {}
    }
    if (msg.content && msg.content.startsWith('["/uploads/')) {
      try {
        const parsed = JSON.parse(msg.content);
        if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].startsWith('/uploads/')) {
          return parsed;
        }
      } catch(e) {}
    }
    if (msg.is_image && msg.content && msg.content.startsWith('/uploads/')) {
      return [msg.content];
    }
    return [];
  };

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
        dateLabel = 'Сегодня';
      } else if (dateKey === yesterday.toDateString()) {
        dateLabel = 'Вчера';
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

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      messageIds.current.clear();
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
        title: 'Ошибка',
        message: 'Не удалось загрузить список пользователей',
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
      const filtered = availableUsers.filter(u => 
        u.username.toLowerCase().includes(searchQuery.toLowerCase())
      );
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
        throw new Error(errorData.detail || 'Failed to update chat');
      }
      
      const updatedChat = await response.json();
      setChat(updatedChat);
      setIsEditingChat(false);
      
      setModal({
        isOpen: true,
        title: 'Успешно',
        message: 'Информация о чате обновлена',
      });
    } catch (error) {
      console.error('Error updating chat:', error);
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: error instanceof Error ? error.message : 'Не удалось обновить информацию о чате',
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
      
      if (!response.ok) throw new Error('Failed to upload avatar');
      
      const data = await response.json();
      setEditChatAvatar(data.url);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Не удалось загрузить аватар',
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
          throw new Error(errorData.detail || 'Failed to add participant');
        }
      }
      
      const updatedChat = await fetchWithAuth(`${apiUrl}/chats/${id}`);
      const chatData = await updatedChat.json();
      setChat(chatData);
      
      setShowAddParticipants(false);
      setSearchQuery('');
      
      setModal({
        isOpen: true,
        title: 'Успешно',
        message: `${userIds.length} участник(ов) добавлен(о)`,
      });
    } catch (error) {
      console.error('Error adding participants:', error);
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: error instanceof Error ? error.message : 'Не удалось добавить участников',
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
        throw new Error(errorData.detail || 'Failed to remove participant');
      }
      
      const updatedChat = await fetchWithAuth(`${apiUrl}/chats/${id}`);
      const chatData = await updatedChat.json();
      setChat(chatData);
      
      setModal({
        isOpen: true,
        title: 'Успешно',
        message: isGroup 
          ? `${username} удален(а) из беседы`
          : `${username} отписан(а) от канала`,
      });
    } catch (error) {
      console.error('Error removing participant:', error);
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: error instanceof Error ? error.message : 'Не удалось удалить участника',
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
        throw new Error(errorData.detail || 'Failed to leave');
      }
      
      navigate('/chat');
      window.dispatchEvent(new Event('refreshChatList'));
    } catch (error) {
      console.error('Error leaving chat:', error);
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: error instanceof Error ? error.message : 'Не удалось покинуть чат',
      });
    }
  };

  const handleImagesUploaded = async (urls: string[]) => {
    if (!canSendMessages()) {
      setModal({
        isOpen: true,
        title: 'Доступ запрещен',
        message: 'Только создатель канала может отправлять сообщения',
      });
      return;
    }

    const tempId = `temp-${Date.now()}`;
    
    const tempMessage: Message = {
      id: tempId,
      content: JSON.stringify(urls),
      sender_id: user!.id,
      chat_id: id!,
      created_at: Math.floor(Date.now() / 1000),
      is_read: false,
      is_image: true,
      images: urls,
    };

    setMessages(prev => {
      const allMessages = [...prev, tempMessage];
      allMessages.sort((a, b) => a.created_at - b.created_at);
      return allMessages;
    });

    try {
      const payload: any = {
        content: JSON.stringify(urls),
        is_image: true,
        images: urls
      };
      
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to send images');

      const data = await response.json();
      
      setMessages(prev => 
        prev.map(msg => msg.id === tempId ? { ...data, images: urls } : msg)
          .sort((a, b) => a.created_at - b.created_at)
      );

      socket.emit('send-message', { ...data, chat_id: id, images: urls });
      
      setTimeout(scrollToBottom, 100);
      
    } catch (error) {
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setModal({
        isOpen: true,
        title: t.error,
        message: 'Не удалось отправить изображения',
      });
    }
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

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, []);

  const loadChatData = useCallback(async () => {
    if (!user || !id || id === 'undefined') return;
    
    setLoading(true);
    try {
      messageIds.current.clear();
      
      const [chatResponse, messagesResponse] = await Promise.all([
        fetchWithAuth(`${apiUrl}/chats/${id}`),
        fetchWithAuth(`${apiUrl}/chats/${id}/messages`),
      ]);

      if (!chatResponse.ok) throw new Error('Failed to load chat');
      
      const chatData = await chatResponse.json();
      setChat(chatData);
      
      const isParticipant = chatData.participants?.some((p: any) => p.user_id === user.id);
      if (!isParticipant) {
        await ensureParticipant(id, user.id);
      }
      
      if (messagesResponse.ok) {
        let messagesData = await messagesResponse.json();
        if (Array.isArray(messagesData)) {
          messagesData = messagesData.map((msg: Message) => {
            if (msg.images && typeof msg.images === 'string') {
              try {
                msg.images = JSON.parse(msg.images);
              } catch(e) {
                msg.images = null;
              }
            }
            return msg;
          });
          messagesData.forEach((msg: Message) => {
            messageIds.current.add(msg.id);
          });
          messagesData.sort((a: Message, b: Message) => a.created_at - b.created_at);
          setMessages(messagesData);
        }
      }
    } catch (error) {
      console.error(error);
      navigate('/chat');
    } finally {
      setLoading(false);
    }
  }, [id, user, apiUrl, navigate, ensureParticipant]);

  useEffect(() => {
    loadChatData();
  }, [loadChatData]);

  useEffect(() => {
    if (!user || !id || loading) return;

    const markEverythingAsRead = async () => {
      try {
        await fetchWithAuth(`${apiUrl}/chats/${id}/messages/read/all`, {
          method: 'POST',
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
    if (!loading && messages.length > 0) {
      setTimeout(scrollToBottom, 200);
    }
  }, [loading, messages.length, scrollToBottom]);

  useEffect(() => {
    if (!user || !id) return;

    socket.connectToChat(id);

    const handleNewMessage = (newMsg: Message) => {
      if (newMsg.sender_id === user.id) return;
      if (newMsg.chat_id !== id) return;
      if (messageIds.current.has(newMsg.id)) return;
      
      messageIds.current.add(newMsg.id);
      setMessages(prev => {
        const newMessages = [...prev, newMsg];
        newMessages.sort((a, b) => a.created_at - b.created_at);
        return newMessages;
      });
      
      setTimeout(scrollToBottom, 100);
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

    socket.on('new-message', handleNewMessage);
    socket.on('message_read', handleMessageRead);
    socket.on('messages_read', handleMessagesRead);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message_read', handleMessageRead);
      socket.off('messages_read', handleMessagesRead);
    };
  }, [id, user, scrollToBottom]);

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

  const handleReply = (msg: Message) => {
    if (!canSendMessages()) {
      setModal({
        isOpen: true,
        title: 'Доступ запрещен',
        message: 'Только создатель канала может отвечать на сообщения',
      });
      return;
    }
    setReplyTo(msg);
    messageInputRef.current?.focus();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!canSendMessages()) {
      setModal({
        isOpen: true,
        title: 'Доступ запрещен',
        message: 'Только создатель канала может отправлять сообщения',
      });
      return;
    }
    
    if (!user || !newMessage.trim() || !id) return;

    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      content: newMessage,
      sender_id: user.id,
      chat_id: id,
      created_at: Math.floor(Date.now() / 1000),
      is_read: false,
      is_sticker: false,
    };

    messageIds.current.add(tempId);
    setMessages(prev => {
      const newMessages = [...prev, tempMessage];
      newMessages.sort((a, b) => a.created_at - b.created_at);
      return newMessages;
    });
    setNewMessage('');

    try {
      const payload: any = { content: newMessage };
      if (replyTo?.id) {
        payload.reply_to_id = replyTo.id;
      }
      
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      
      messageIds.current.delete(tempId);
      messageIds.current.add(data.id);
      
      setMessages(prev => 
        prev.map(msg => msg.id === tempId ? { ...data, reply_to_id: replyTo?.id } : msg)
          .sort((a, b) => a.created_at - b.created_at)
      );

      socket.emit('send-message', { ...data, chat_id: id });
      
      setReplyTo(null);
      setTimeout(scrollToBottom, 100);
      
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

  const handleSendSticker = async (stickerId: string, emoji: string) => {
    if (!canSendMessages()) {
      setModal({
        isOpen: true,
        title: 'Доступ запрещен',
        message: 'Только создатель канала может отправлять стикеры',
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

      if (!response.ok) throw new Error('Failed to send sticker');

      const data = await response.json();
      
      messageIds.current.delete(tempId);
      messageIds.current.add(data.id);
      
      setMessages(prev => 
        prev.map(msg => msg.id === tempId ? { ...data } : msg)
          .sort((a, b) => a.created_at - b.created_at)
      );
      
      setTimeout(scrollToBottom, 100);
      
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

  if (loading) {
    return <LoadingScreen />;
  }

  if (!chat) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">{t.chatNotFound || 'Чат не найден'}</div>
      </div>
    );
  }

  const getChatDisplayName = () => {
    if (chat?.name && (chat.chat_type === 'group' || chat.chat_type === 'channel')) {
      return chat.name;
    }
    
    if (chat?.chat_type === 'private' && chat?.participants) {
      const otherUser = chat.participants.find(p => p.user_id !== user?.id);
      return otherUser?.username || 'Чат';
    }
    
    return 'Чат';
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
  const chatColor = getChatColor(chat?.chat_type || 'private');
  const isCreator = chat?.created_by === user?.id;
  
  const messageGroups = groupMessagesByDate(messages);
  
  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col h-screen">
        <div className="sticky top-0 z-10 bg-white/5 backdrop-blur-sm border-b border-white/10 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
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
                          <span className="text-yellow-400/80 text-sm" title="Вы создатель">👑</span>
                        )}
                      </div>
                      <p className="text-xs text-purple-300">
                        {isGroup ? `${chat.participants?.length || 0} участников` : `${chat.participants?.length || 0} подписчиков`}
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
                      title="Редактировать чат"
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
                      title="Добавить участников"
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
                      title={isGroup ? "Покинуть беседу" : "Отписаться от канала"}
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
                <div 
                  onClick={() => openUserProfile(otherUser.user_id)}
                  className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                  title={t.viewProfile || 'Открыть профиль'}
                >
                  <Avatar 
                    userId={otherUser.user_id}
                    name={otherUser.username}
                    size="lg" 
                    src={otherUser.avatar}
                  />
                  <h1 className="text-xl font-semibold text-white">{chatName}</h1>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar 
                    userId={otherUser?.user_id}
                    name={otherUser?.username}
                    size="lg" 
                  />
                  <h1 className="text-xl font-semibold text-white">{chatName}</h1>
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              <UserMenu username={user?.username || ''} email={user?.email || ''} />
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="max-w-4xl mx-auto flex flex-col min-h-full">
              {messages.length === 0 ? (
                <div className="text-center text-purple-300 py-8">
                  {t.noMessages}
                </div>
              ) : (
                messageGroups.map((group, groupIndex) => (
                  <div key={group.dateKey} className={groupIndex > 0 ? 'mt-6' : ''}>
                    <div className="flex justify-center my-4">
                      <div className="bg-white/10 backdrop-blur-sm px-4 py-1 rounded-full border border-white/10">
                        <span className="text-purple-300 text-xs font-medium">{group.dateLabel}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
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
                        
                        const sender = chat?.participants?.find(p => p.user_id === msg.sender_id);
                        const senderName = sender?.username || 'Пользователь';
                        const isGroupChat = chat?.chat_type === 'group' || chat?.chat_type === 'channel';

                        return (
                          <div
                            id={`message-${msg.id}`}
                            key={msg.id}
                            className={`flex ${isOwn ? 'justify-end' : 'justify-start'} scroll-mt-20`}
                          >
                            <div
                              className={`max-w-[70%] ${
                                isOwn
                                  ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                  : 'bg-white/10 text-white'
                              } rounded-2xl overflow-hidden`}
                            >
                              <div className="px-4 py-2">
                                {!isOwn && isGroupChat && (
                                  <div className="flex items-center gap-2 mb-2 pb-1 border-b border-white/10">
                                    {sender?.avatar ? (
                                      <img 
                                        src={sender.avatar} 
                                        alt={senderName} 
                                        className="w-5 h-5 rounded-full object-cover cursor-pointer"
                                        onClick={() => openUserProfile(msg.sender_id)}
                                      />
                                    ) : (
                                      <Avatar 
                                        userId={sender?.user_id}
                                        name={senderName}
                                        size="xs" 
                                      />
                                    )}
                                    <span 
                                      className="text-xs font-medium text-purple-300 cursor-pointer hover:text-purple-200 transition"
                                      onClick={() => openUserProfile(msg.sender_id)}
                                    >
                                      {senderName}
                                    </span>
                                  </div>
                                )}

                                {replyToMsg && (
                                  <div 
                                    onClick={() => scrollToMessage(replyToMsg.id)}
                                    className="mb-2 pb-1 border-l-2 border-purple-400 pl-2 text-xs opacity-60 cursor-pointer hover:opacity-100 transition"
                                    title="Перейти к сообщению"
                                  >
                                    <span className="font-medium">Ответ на сообщение:</span>
                                    <p className="truncate">
                                      {replyToMsg.is_image ? '📷 Изображение' : replyToMsg.content}
                                    </p>
                                  </div>
                                )}
                                
                                {imageUrls.length > 0 ? (
                                  <div className={`grid ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-1 max-w-[300px]`}>
                                    {imageUrls.map((url, idx) => (
                                      <img 
                                        key={idx}
                                        src={url} 
                                        alt={`image ${idx + 1}`} 
                                        className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition"
                                        onClick={() => openImageViewer(imageUrls, idx)}
                                      />
                                    ))}
                                  </div>
                                ) : msg.is_sticker ? (
                                  <span className="text-6xl block leading-none break-keep">{msg.content}</span>
                                ) : (
                                  <p className="break-words whitespace-pre-wrap overflow-wrap-anywhere">
                                    {msg.content}
                                  </p>
                                )}
                                
                                <div className="flex items-center justify-end gap-2 mt-2">
                                  <button
                                    onClick={() => handleReply(msg)}
                                    className="text-white/50 hover:text-white transition p-1 rounded-lg hover:bg-white/10"
                                    title="Ответить"
                                  >
                                    <svg 
                                      xmlns="http://www.w3.org/2000/svg" 
                                      width="14" 
                                      height="14" 
                                      viewBox="0 0 24 24" 
                                      fill="none" 
                                      stroke="currentColor" 
                                      strokeWidth="2" 
                                      strokeLinecap="round" 
                                      strokeLinejoin="round"
                                    >
                                      <path d="M3 10h10a8 8 0 0 1 8 8v2"/>
                                      <path d="M3 10l4-4-4-4"/>
                                    </svg>
                                  </button>
                                  <p className="text-xs opacity-70">{formattedDate}</p>
                                  {isOwn && (
                                    <span className="text-xs opacity-70">
                                      {msg.is_read ? '✓✓' : '✓'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              <div className="mt-auto" />
              <div ref={messagesEndRef} />
            </div>
          </div>
        </div>

        {canSendMessages() ? (
          <div className="border-t border-white/10 px-4 py-3 md:px-6 md:py-4">
            <form onSubmit={sendMessage} className="max-w-4xl mx-auto">
              {replyTo && (
                <div className="mb-2 p-2 bg-purple-500/20 rounded-lg flex justify-between items-center">
                  <div 
                    className="flex-1 cursor-pointer hover:opacity-80 transition overflow-hidden"
                    onClick={() => scrollToMessage(replyTo.id)}
                    title="Перейти к сообщению"
                  >
                    <p className="text-xs text-purple-300">Ответ на сообщение:</p>
                    <p className="text-sm text-white truncate max-w-[300px] md:max-w-[500px]">
                      {replyTo.is_image ? '📷 Изображение' : replyTo.content}
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
              <div className="flex gap-2 items-center">
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
                  chatId={id!}
                  onImagesUploaded={handleImagesUploaded}
                  onError={handleImageError}
                />
                
                <input
                  ref={messageInputRef}
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder={t.enterMessage}
                  className="flex-1 min-w-0 px-3 py-2 md:px-4 md:py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all text-sm md:text-base"
                />
                
                <button
                  type="submit"
                  className="flex-shrink-0 w-10 h-10 bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 transition-all duration-300 cursor-pointer flex items-center justify-center border border-white/20"
                  title={t.send}
                >
                  <img
                    src="/favicon-96x96.png"
                    alt="Send"
                    className="w-10 h-10 object-contain"
                  />
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="border-t border-white/10 px-4 py-4 md:px-6 md:py-4 bg-purple-500/10">
            <div className="max-w-4xl mx-auto text-center">
              <p className="text-purple-300 text-sm">
                📢 Это канал. Только создатель может отправлять сообщения.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Модалка участников/подписчиков */}
      {participantsModal && chat && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                {isGroup ? 'Участники' : 'Подписчики'}
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
                        openUserProfile(participant.user_id);
                      }}
                    >
                      <Avatar 
                        userId={participant.user_id}
                        name={participant.username}
                        size="md"
                        src={participant.avatar}
                      />
                      <div className="flex items-center gap-2">
                        <p className="text-white font-medium">{participant.username}</p>
                        {isCreatorUser && (
                          <span className="text-yellow-400/80 text-sm" title="Создатель">👑</span>
                        )}
                      </div>
                    </div>
                    {canRemove && (
                      <button
                        onClick={() => setRemoveConfirm({ userId: participant.user_id, username: participant.username })}
                        className="text-red-400/70 hover:text-red-400 transition p-1 rounded-lg hover:bg-white/10"
                        title={isGroup ? "Удалить из беседы" : "Отписать от канала"}
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
                + Добавить участников
              </button>
            )}
            <button
              onClick={() => setParticipantsModal(false)}
              className="w-full mt-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Модалка подтверждения удаления участника */}
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
                {isGroup ? 'Удалить участника' : 'Отписать подписчика'}
              </h2>
              <p className="text-purple-200">
                Вы уверены, что хотите {isGroup ? 'удалить' : 'отписать'} <span className="font-semibold text-white">{removeConfirm.username}</span> 
                {isGroup ? ' из беседы' : ' от канала'}?
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => removeParticipant(removeConfirm.userId, removeConfirm.username)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
              >
                {isGroup ? 'Удалить' : 'Отписать'}
              </button>
              <button
                onClick={() => setRemoveConfirm(null)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка подтверждения выхода из чата */}
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
                {isGroup ? 'Покинуть беседу' : 'Отписаться от канала'}
              </h2>
              <p className="text-purple-200">
                Вы уверены, что хотите {isGroup ? 'покинуть беседу' : 'отписаться от канала'}?
                {isGroup && ' Все сообщения останутся, но вы не сможете их просматривать.'}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={leaveChat}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
              >
                {isGroup ? 'Покинуть' : 'Отписаться'}
              </button>
              <button
                onClick={() => setLeaveConfirm(false)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка добавления участников (только для групп) */}
      {showAddParticipants && isGroup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">Добавить участников</h2>
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
              placeholder="Поиск пользователей..."
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
            />
            
            <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
              {filteredUsers.length === 0 ? (
                <p className="text-purple-300 text-center py-4">
                  {searchQuery ? 'Пользователь не найден' : 'Нет доступных пользователей'}
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
                      name={u.username}
                      size="md"
                      src={u.avatar}
                    />
                    <p className="text-white font-medium">{u.username}</p>
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
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Модалка редактирования чата */}
      {isEditingChat && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-white">
                Редактировать {isGroup ? 'беседу' : 'канал'}
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
                  title="Загрузить аватар"
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
              placeholder="Название"
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
                {uploadingAvatar ? 'Загрузка...' : 'Сохранить'}
              </button>
              <button
                onClick={() => setIsEditingChat(false)}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Просмотр аватара в полный размер */}
      {avatarViewer && (
        <ImageViewer
          images={[avatarViewer]}
          initialIndex={0}
          onClose={() => setAvatarViewer(null)}
        />
      )}

      {showStickerPicker && (
        <StickerPicker
          onSelectSticker={handleSendSticker}
          onClose={() => setShowStickerPicker(false)}
        />
      )}

      {viewerImages && (
        <ImageViewer
          images={viewerImages}
          initialIndex={viewerIndex}
          onClose={() => setViewerImages(null)}
        />
      )}

      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${
                modal.title === 'Успешно' 
                  ? 'bg-green-500/20' 
                  : 'bg-red-500/20'
              }`}>
                {modal.title === 'Успешно' ? (
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
    </>
  );
}