import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../lib/api';
import { socket } from '../lib/socket';
import { useAppSelector } from '../lib/redux/hooks';
import { translations } from '../lib/locales';
import type { Chat } from '../types/chat';
import type { LastMessage } from '../types/message';
import LoadingScreen from './LoadingScreen';
import UserMenu from './UserMenu';
import Logo from './Logo';
import Avatar from './Avatar';
import CreateChatModal from './CreateChatModal';
import ChannelSearch from './ChannelSearch';
import { getCachedChatList, setCachedChatList } from '../lib/cache';
import { getUserDisplayName } from '../lib/userDisplay';
import { getMessagePreview } from '../lib/messagePreview';

export default function ChatList() {
  const navigate = useNavigate();
  const { user, language } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  const [chats, setChats] = useState<Chat[]>([]);
  const [lastMessages, setLastMessages] = useState<Map<string, LastMessage>>(new Map());
  const [unreadCounts, setUnreadCounts] = useState<Map<string, number>>(new Map());
  const [unreadReactions, setUnreadReactions] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [hasCachedChats, setHasCachedChats] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [actionChatId, setActionChatId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'delete' | 'leave' | 'unsubscribe' | null>(null);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const [incomingCall, setIncomingCall] = useState<{ from: string; chatId: string } | null>(null);

  const ADMIN_ID = '33f676d7-9ab6-4eaa-b3c4-d4552b499f58';

  const toLastMessage = useCallback((message: any): LastMessage => ({
    id: message.id, content: message.content || '', created_at: message.created_at,
    sender_id: message.sender_id, sender_name: message.sender_name || '',
    is_image: message.is_image, images: message.images, is_sticker: message.is_sticker,
    media: message.media, edited_at: message.edited_at, deleted_at: message.deleted_at,
  }), []);

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  const openUserProfile = (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (username === user?.username) {
      navigate('/profile');
    } else {
      navigate(`/user/${username}`);
    }
  };

  const loadUnreadCount = useCallback(async (chatId: string) => {
    try {
      const response = await fetchWithAuth(`/chats/${chatId}/messages/unread/count`);
      const data = await response.json();
      if (data.count > 0) {
        setUnreadCounts(prev => new Map(prev).set(chatId, data.count));
      } else {
        setUnreadCounts(prev => {
          const newMap = new Map(prev);
          newMap.delete(chatId);
          return newMap;
        });
      }
      return data.count;
    } catch (error) {
      console.error('Error loading unread count:', error);
      return 0;
    }
  }, []);

  const loadLastMessage = useCallback(async (chatId: string) => {
    try {
      const response = await fetchWithAuth(`/chats/${chatId}/last-message`);
      const data = await response.json();
      
      if (data && data.id) {
        setLastMessages(prev => new Map(prev).set(chatId, toLastMessage(data)));
        return data.created_at;
      }
    } catch (error) {
      console.error('Error loading last message:', error);
    }
    return null;
  }, [toLastMessage]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const loadChats = async () => {
      const cached = await getCachedChatList(user.id);
      if (cached && !cancelled) {
        setChats(cached.chats);
        setLastMessages(new Map(cached.lastMessages));
        setUnreadCounts(new Map(cached.unreadCounts));
        setUnreadReactions(new Map(cached.unreadReactions));
        setHasCachedChats(true);
        setLoading(false);
      } else if (!cancelled) {
        setHasCachedChats(false);
        setLoading(true);
      }

      try {
        const response = await fetchWithAuth(`/chats/`);
        const data = await response.json();
        
        if (Array.isArray(data) && !cancelled) {
          setChats(data);
          setHasCachedChats(true);
          setUnreadReactions(new Map(data.filter((chat: Chat) => (chat.unread_reactions_count || 0) > 0).map((chat: Chat) => [chat.id, chat.unread_reactions_count || 0])));
          setUnreadCounts(new Map(data.filter((chat: Chat) => (chat.unread_count || 0) > 0).map((chat: Chat) => [chat.id, chat.unread_count || 0])));
          
          const promises = data.map(async (chat: Chat) => {
            await loadLastMessage(chat.id);
          });
          await Promise.all(promises);
        }
      } catch (error) {
        console.error('Error loading chats:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    
    void loadChats();
    return () => { cancelled = true; };
  }, [user, loadLastMessage]);

  useEffect(() => {
    if (!user || (!hasCachedChats && chats.length === 0)) return;
    const timer = window.setTimeout(() => {
      void setCachedChatList(user.id, {
        chats,
        lastMessages: Array.from(lastMessages.entries()),
        unreadCounts: Array.from(unreadCounts.entries()),
        unreadReactions: Array.from(unreadReactions.entries()),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [user, chats, lastMessages, unreadCounts, unreadReactions, hasCachedChats]);

  useEffect(() => {
    if (chats.length === 0) return;
    
    const sorted = [...chats].sort((a, b) => {
      const msgA = lastMessages.get(a.id);
      const msgB = lastMessages.get(b.id);
      const timeA = msgA?.created_at || 0;
      const timeB = msgB?.created_at || 0;
      return timeB - timeA;
    });
    
    if (JSON.stringify(sorted) !== JSON.stringify(chats)) {
      setChats(sorted);
    }
  }, [lastMessages, chats]);

  useEffect(() => {
    if (!user) return;

    const handleNewMessage = (newMsg: any) => {
      if (newMsg.sender_id !== user.id) {
        setLastMessages(prev => new Map(prev).set(newMsg.chat_id, toLastMessage(newMsg)));
        loadUnreadCount(newMsg.chat_id);
        loadLastMessage(newMsg.chat_id);
        
        setChats(prev => {
          const chatIndex = prev.findIndex(c => c.id === newMsg.chat_id);
          if (chatIndex !== -1) {
            const updatedChats = [...prev];
            const chat = updatedChats.splice(chatIndex, 1)[0];
            return [chat, ...updatedChats];
          }
          return prev;
        });
      }
    };

    const handleMessageRead = (data: { chat_id: string; user_id: string }) => {
      if (data.user_id === user.id) return;
      loadUnreadCount(data.chat_id);
    };

    const handleMessagesRead = (data: { chat_id: string; user_id: string }) => {
      setUnreadCounts(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.chat_id);
        return newMap;
      });
      loadLastMessage(data.chat_id);
    };

    const handleMessageUpdated = (data: { chat_id: string; message: LastMessage }) => {
      if (!data?.chat_id || !data?.message) return;
      setLastMessages(prev => new Map(prev).set(data.chat_id, toLastMessage(data.message)));
    };

    const handleReactionNotification = (data: { chat_id: string }) => {
      setUnreadReactions(prev => new Map(prev).set(data.chat_id, 1));
    };
    const clearReactionNotification = (data: { chat_id: string }) => {
      setUnreadReactions(prev => {
        const next = new Map(prev);
        next.delete(data.chat_id);
        return next;
      });
    };
    const handleReactionNotificationRemoved = async (data: { chat_id: string }) => {
      try {
        const response = await fetchWithAuth('/chats/');
        const refreshedChats: Chat[] = await response.json();
        const chat = refreshedChats.find(item => item.id === data.chat_id);
        if (chat?.has_unread_reactions) {
          setUnreadReactions(prev => new Map(prev).set(data.chat_id, chat.unread_reactions_count || 1));
        } else {
          clearReactionNotification(data);
        }
      } catch {
        clearReactionNotification(data);
      }
    };

    socket.on('new-message', handleNewMessage);
    socket.on('message_read', handleMessageRead);
    socket.on('messages_read', handleMessagesRead);
    socket.on('edit_message', handleMessageUpdated);
    socket.on('delete_message', handleMessageUpdated);
    socket.on('message_reaction_notification', handleReactionNotification);
    socket.on('message_reaction_notification_removed', handleReactionNotificationRemoved);
    socket.on('reaction_notifications_read', clearReactionNotification);
    
    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message_read', handleMessageRead);
      socket.off('messages_read', handleMessagesRead);
      socket.off('edit_message', handleMessageUpdated);
      socket.off('delete_message', handleMessageUpdated);
      socket.off('message_reaction_notification', handleReactionNotification);
      socket.off('message_reaction_notification_removed', handleReactionNotificationRemoved);
      socket.off('reaction_notifications_read', clearReactionNotification);
    };
  }, [user, loadUnreadCount, loadLastMessage, toLastMessage]);

  useEffect(() => {
    const handleRefreshChatList = async () => {
      try {
        const response = await fetchWithAuth(`/chats/`);
        const data = await response.json();
        
        if (Array.isArray(data)) {
          setChats(data);
          setUnreadReactions(new Map(data.filter((chat: Chat) => (chat.unread_reactions_count || 0) > 0).map((chat: Chat) => [chat.id, chat.unread_reactions_count || 0])));
          
          const newUnreadCounts = new Map();
          await Promise.all(
            data.map(async (chat: Chat) => {
              if ((chat.unread_count || 0) > 0) newUnreadCounts.set(chat.id, chat.unread_count || 0);
              
              const lastMsgResponse = await fetchWithAuth(`/chats/${chat.id}/last-message`);
              const lastMsgData = await lastMsgResponse.json();
              if (lastMsgData && lastMsgData.id) {
                setLastMessages(prev => new Map(prev).set(chat.id, toLastMessage(lastMsgData)));
              }
            })
          );
          setUnreadCounts(newUnreadCounts);
        }
      } catch (error) {
        console.error('Error refreshing chat list:', error);
      }
    };
    
    window.addEventListener('refreshChatList', handleRefreshChatList);
    return () => window.removeEventListener('refreshChatList', handleRefreshChatList);
  }, [toLastMessage]);

  // Обработка входящих звонков
  useEffect(() => {
    const handleIncomingCall = (event: CustomEvent) => {
      const { caller_id, chat_id } = event.detail;
      console.log(`📞 Incoming call from ${caller_id} in chat ${chat_id}`);
      
      // Находим имя звонящего
      const chat = chats.find(c => c.id === chat_id);
      const caller = chat?.participants?.find(p => p.user_id === caller_id);
      const callerName = getUserDisplayName(caller, t.userUnknown);
      
      setIncomingCall({ from: caller_id, chatId: chat_id });
      
      const accept = window.confirm(`${callerName} ${t.incomingCallQuestion}`);
      if (accept) {
        navigate(`/chat/${chat_id}`);
      }
      setIncomingCall(null);
    };

    window.addEventListener('incoming_call', handleIncomingCall as EventListener);
    
    return () => {
      window.removeEventListener('incoming_call', handleIncomingCall as EventListener);
    };
  }, [navigate, chats]);

  const handleChatCreated = (chatId: string) => {
    navigate(`/chat/${chatId}`);
    window.dispatchEvent(new Event('refreshChatList'));
  };

  const handleDeleteChat = async (chatId: string) => {
    try {
      const response = await fetchWithAuth(`/chats/${chatId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        setLastMessages(prev => {
          const newMap = new Map(prev);
          newMap.delete(chatId);
          return newMap;
        });
        setUnreadCounts(prev => {
          const newMap = new Map(prev);
          newMap.delete(chatId);
          return newMap;
        });
        
        setModal({
          isOpen: true,
          title: t.success,
          message: t.chatDeleted,
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.failedToDeleteChat);
      }
    } catch (error) {
      console.error('Ошибка при удалении чата:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToDeleteChat,
      });
    } finally {
      setActionChatId(null);
      setActionType(null);
    }
  };

  const handleLeaveGroup = async (chatId: string) => {
    try {
      const response = await fetchWithAuth(`/chats/${chatId}/participants/${user!.id}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        setLastMessages(prev => {
          const newMap = new Map(prev);
          newMap.delete(chatId);
          return newMap;
        });
        setUnreadCounts(prev => {
          const newMap = new Map(prev);
          newMap.delete(chatId);
          return newMap;
        });
        
        setModal({
          isOpen: true,
          title: t.success,
          message: t.leftChat,
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.failedToLeaveChat);
      }
    } catch (error) {
      console.error('Ошибка при выходе из беседы:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToLeaveChat,
      });
    } finally {
      setActionChatId(null);
      setActionType(null);
    }
  };

  const handleUnsubscribeFromChannel = async (chatId: string) => {
    try {
      const response = await fetchWithAuth(`/chats/${chatId}/unsubscribe`, {
        method: 'POST',
      });
      
      if (response.ok) {
        setChats(prev => prev.filter(chat => chat.id !== chatId));
        setLastMessages(prev => {
          const newMap = new Map(prev);
          newMap.delete(chatId);
          return newMap;
        });
        setUnreadCounts(prev => {
          const newMap = new Map(prev);
          newMap.delete(chatId);
          return newMap;
        });
        
        setModal({
          isOpen: true,
          title: t.success,
          message: t.unsubscribedFromChannel,
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || t.failedToUnsubscribeChannel);
      }
    } catch (error) {
      console.error('Ошибка при отписке от канала:', error);
      setModal({
        isOpen: true,
        title: t.error,
        message: error instanceof Error ? error.message : t.failedToUnsubscribeChannel,
      });
    } finally {
      setActionChatId(null);
      setActionType(null);
    }
  };

  const handleAction = () => {
    if (!actionChatId) return;
    
    if (actionType === 'delete') {
      handleDeleteChat(actionChatId);
    } else if (actionType === 'leave') {
      handleLeaveGroup(actionChatId);
    } else if (actionType === 'unsubscribe') {
      handleUnsubscribeFromChannel(actionChatId);
    }
  };

  const getActionButton = (chat: Chat) => {
    const chatType = chat.chat_type || 'private';
    const isPrivate = chatType === 'private';
    const isGroup = chatType === 'group';
    const isChannel = chatType === 'channel';
    const isCreator = chat.created_by === user?.id;
    const isAdmin = user?.username === 'admin';
    
    if (isPrivate) {
      return {
        show: true,
        action: 'delete' as 'delete',
        title: t.deleteChat,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )
      };
    }
    
    if (isChannel) {
      if (isAdmin) {
        return {
          show: true,
          action: 'delete' as 'delete',
          title: t.deleteChannel,
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )
        };
      }
      if (isCreator) {
        return {
          show: true,
          action: 'delete' as 'delete',
          title: t.deleteChannel,
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )
        };
      }
      return {
        show: true,
        action: 'unsubscribe' as 'unsubscribe',
        title: t.unsubscribeChannel,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 11H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
          </svg>
        )
      };
    }
    
    if (isGroup) {
      if (isAdmin) {
        return {
          show: true,
          action: 'delete' as 'delete',
          title: t.deleteConversation,
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )
        };
      }
      if (isCreator) {
        return {
          show: true,
          action: 'delete' as 'delete',
          title: t.deleteConversation,
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          )
        };
      }
      return {
        show: true,
        action: 'leave' as 'leave',
        title: t.leaveGroup,
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 11H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" />
          </svg>
        )
      };
    }
    
    return { show: false, action: null, title: '', icon: null };
  };

  const getActionModalContent = () => {
    if (actionType === 'delete') {
      return {
        title: t.deleteChat,
        message: t.deleteChatWarning,
        buttonText: t.delete
      };
    }
    if (actionType === 'leave') {
      return {
        title: t.leaveGroup,
        message: t.leaveGroupWarning,
        buttonText: t.leaveGroup
      };
    }
    if (actionType === 'unsubscribe') {
      return {
        title: t.unsubscribeChannel,
        message: t.unsubscribeChannelWarning,
        buttonText: t.unsubscribeChannel
      };
    }
    return { title: '', message: '', buttonText: '' };
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (hours < 48) {
      return t.yesterday;
    } else {
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  const modalContent = getActionModalContent();

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white/5 backdrop-blur-sm border-b border-white/10 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo variant="icon" />
              <h1 className="text-xl font-semibold text-white">QueenChat</h1>
            </div>
            <div className="flex items-center gap-4">
              <UserMenu username={user?.username || ''} email={user?.email || ''} />
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-6 py-6">
          {/* Action Buttons */}
          <div className="fixed bottom-6 right-6 flex flex-col gap-3 z-50">
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg flex items-center justify-center hover:scale-105 transition duration-300 hover:shadow-xl"
              title={t.createChat}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
            
            <ChannelSearch />
          </div>

          {/* Chat List */}
          <div className="space-y-2">
            {chats.length === 0 ? (
              <div className="text-center text-purple-300 py-8">
                {t.noChats}
              </div>
            ) : (
              chats.map(chat => {
                const chatType = chat.chat_type || 'private';
                const isPrivate = chatType === 'private';
                const isGroup = chatType === 'group';
                const isChannel = chatType === 'channel';
                
                const otherUser = isPrivate && chat.participants?.find(p => p.user_id !== user?.id);
                
                let displayName = '';
                if (isPrivate) {
                  displayName = getUserDisplayName(otherUser, t.userUnknown);
                } else if (chat.name) {
                  displayName = chat.name;
                } else if (isGroup) {
                  displayName = t.groupChat;
                } else if (isChannel) {
                  displayName = t.channelChat;
                } else {
                  displayName = t.chat;
                }
                
                const isAdminUser = otherUser?.user_id === ADMIN_ID;
                const isCreator = chat.created_by === user?.id;
                
                const lastMsg = lastMessages.get(chat.id);
                const isOwn = lastMsg?.sender_id === user?.id;
                const msgPreview = getMessagePreview(lastMsg, language as 'ru' | 'en', { noMessagesLabel: t.noMessages, deletedLabel: t.messageDeleted });
                const unreadCount = unreadCounts.get(chat.id) || 0;
                const unreadReactionCount = unreadReactions.get(chat.id) || 0;
                const showParticipantsCount = !isPrivate && chat.participants?.length;
                
                const actionButton = getActionButton(chat);
                
                const showSender = isGroup && lastMsg && !isOwn;
                const messageSender = chat.participants?.find(participant => participant.user_id === lastMsg?.sender_id);
                const senderName = showSender ? getUserDisplayName(messageSender, t.userUnknown) : '';
                
                return (
                  <div
                    key={chat.id}
                    className={`bg-white/10 backdrop-blur-sm rounded-xl p-3 hover:bg-white/20 transition-all duration-200 cursor-pointer group ${
                      unreadCount > 0 || unreadReactionCount > 0 ? 'bg-purple-500/20' : ''
                    } ${
                      isChannel ? 'border-l-4 border-l-yellow-500/50' : ''
                    } ${
                      isGroup ? 'border-l-4 border-l-green-500/50' : ''
                    } ${
                      isPrivate ? 'border-l-4 border-l-purple-500/50' : ''
                    }`}
                    onClick={() => navigate(`/chat/${chat.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {isPrivate ? (
                          <Avatar 
                            userId={otherUser?.user_id}
                            name={getUserDisplayName(otherUser, t.userUnknown)}
                            size="lg"
                            src={otherUser?.avatar}
                            onClick={(e) => otherUser && openUserProfile(otherUser.username, e)}
                          />
                        ) : isGroup ? (
                          <div className="relative">
                            <Avatar 
                              isGroup={true}
                              size="lg"
                              src={chat.avatar || undefined}
                            />
                            <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-0.5 shadow-lg">
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                              </svg>
                            </div>
                          </div>
                        ) : isChannel ? (
                          <div className="relative">
                            <Avatar 
                              isChannel={true}
                              size="lg"
                              src={chat.avatar || undefined}
                            />
                            <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-0.5 shadow-lg">
                              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                              </svg>
                            </div>
                          </div>
                        ) : (
                          <Avatar 
                            userId={otherUser?.user_id}
                            name={getUserDisplayName(otherUser, t.userUnknown)}
                            size="lg"
                          />
                        )}
                        
                        {unreadCount > 0 && (
                          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 font-bold shadow-lg">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </div>
                        )}
                        {unreadReactionCount > 0 && (
                          <div className="absolute -bottom-1 -right-1 rounded-full border border-purple-200/50 bg-purple-600 px-1.5 py-0.5 text-xs leading-none shadow-lg" title="Непрочитанная реакция">♥</div>
                        )}
                      </div>
                      
                      {/* Chat Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <div className="hidden sm:flex items-center gap-1.5">
                                {isGroup && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" className="flex-shrink-0">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                    <circle cx="9" cy="7" r="4"/>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                                  </svg>
                                )}
                                {isChannel && (
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" className="flex-shrink-0">
                                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                    <polyline points="22,6 12,13 2,6"/>
                                  </svg>
                                )}
                              </div>
                              <h3 className={`font-semibold break-words text-base sm:text-lg ${unreadCount > 0 ? 'text-white' : 'text-white/80'}`}>
                                {displayName}
                              </h3>
                            </div>
                            
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {isCreator && !isPrivate && (
                                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full" title={t.youAreCreator}>👑</span>
                              )}
                              {isAdminUser && (
                                <span className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium shadow-sm">{t.admin}</span>
                              )}
                              {isGroup && (
                                <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">{t.groupChat}</span>
                              )}
                              {isChannel && (
                                <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded-full">{t.channelChat}</span>
                              )}
                              {showParticipantsCount && (
                                <span className="text-xs bg-purple-500/30 text-purple-300 px-1.5 py-0.5 rounded-full">
                                  {isGroup ? `👥 ${chat.participants.length}` : `👥 ${chat.participants.length}`}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {lastMsg && (
                            <span className={`text-xs flex-shrink-0 whitespace-nowrap ${unreadCount > 0 ? 'text-purple-300' : 'text-purple-400/60'}`}>
                              {formatTime(lastMsg.created_at)}
                            </span>
                          )}
                        </div>
                        
                        <p className={`text-sm truncate mt-1 ${unreadCount > 0 ? 'text-white font-medium' : 'text-purple-300'}`}>
                          {isChannel && !isOwn && (
                            <span className="text-yellow-400 mr-1">📢</span>
                          )}
                          {showSender && (
                            <span className="text-purple-400 mr-1">
                              {senderName}: 
                            </span>
                          )}
                          {isOwn && <span className="text-purple-400 mr-1">{t.you}: </span>}
                          {msgPreview}
                        </p>
                      </div>
                      
                      {actionButton.show && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionChatId(chat.id);
                            setActionType(actionButton.action);
                          }}
                          className="text-red-400/70 hover:text-red-400 transition-all duration-200 p-2 rounded-lg hover:bg-white/10 flex-shrink-0"
                          title={actionButton.title}
                        >
                          {actionButton.icon}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <CreateChatModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onChatCreated={handleChatCreated}
      />

      {actionChatId && actionType && (
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
              <h2 className="text-2xl font-bold text-white mb-2">{modalContent.title}</h2>
              <p className="text-purple-200">{modalContent.message}</p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handleAction}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
              >
                {modalContent.buttonText}
              </button>
              <button
                onClick={() => {
                  setActionChatId(null);
                  setActionType(null);
                }}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

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
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition cursor-pointer"
            >
              {t.ok}
            </button>
          </div>
        </div>
      )}

      {/* Модальное окно для входящего звонка */}
      {incomingCall && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-green-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="green" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">{t.incomingCallTitle}</h2>
              <p className="text-purple-200">
                {(() => {
                  const caller = chats.find(c => c.id === incomingCall.chatId)?.participants?.find(p => p.user_id === incomingCall.from);
                  return getUserDisplayName(caller, t.userUnknown);
                })()} {t.incomingCallQuestion}
              </p>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  navigate(`/chat/${incomingCall.chatId}`);
                  setIncomingCall(null);
                }}
                className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition cursor-pointer"
              >
                {t.acceptCall}
              </button>
              <button
                onClick={() => setIncomingCall(null)}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
              >
                {t.declineCall}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
