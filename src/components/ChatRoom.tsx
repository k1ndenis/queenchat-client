import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../lib/redux/hooks';
import { fetchWithAuth } from '../../lib/api';
import { socket } from '../../lib/socket';
import StickerPicker from './StickerPicker';
import LoadingScreen from './LoadingScreen';
import type { Message } from '../types/message';
import type { ChatInfo } from '../types/chat';

export default function ChatRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppSelector(state => state.user);
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;
  const isMounted = useRef(true);
  const messageIds = useRef<Set<string>>(new Set());

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
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

  useEffect(() => {
    if (!user || !id || id === 'undefined') return;

    const loadChatData = async () => {
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
        
        const isParticipant = chatData.participants?.some((p: any) => p.id === user.id);
        if (!isParticipant) {
          await ensureParticipant(id, user.id);
        }
        
        if (messagesResponse.ok) {
          let messagesData = await messagesResponse.json();
          if (Array.isArray(messagesData)) {
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
    };
    
    loadChatData();
  }, [id, user, apiUrl, navigate, ensureParticipant]);

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
    };

    const handleMessageRead = (data: { message_id: string; user_id: string; chat_id: string }) => {
      console.log('🔵 Message read received:', data);
      
      if (data.chat_id !== id) return;
      
      setMessages(prev =>
        prev.map(msg => {
          if (msg.id === data.message_id) {
            console.log('✅ Updating message', msg.id, 'is_read to true');
            return { ...msg, is_read: true };
          }
          return msg;
        })
      );
    };

    socket.on('new-message', handleNewMessage);
    socket.on('message_read', handleMessageRead);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message_read', handleMessageRead);
    };
  }, [id, user]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: newMessage }),
      });

      if (!response.ok) throw new Error('Failed to send message');

      const data = await response.json();
      
      messageIds.current.delete(tempId);
      messageIds.current.add(data.id);
      
      setMessages(prev => 
        prev.map(msg => msg.id === tempId ? { ...data } : msg)
          .sort((a, b) => a.created_at - b.created_at)
      );

      socket.emit('send-message', { ...data, chat_id: id });
      
    } catch (error) {
      messageIds.current.delete(tempId);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Не удалось отправить сообщение',
      });
    }
  };

  const handleSendSticker = async (stickerId: string, emoji: string) => {
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
    } catch (error) {
      messageIds.current.delete(tempId);
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Не удалось отправить стикер',
      });
    }
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (!chat) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Чат не найден</div>
      </div>
    );
  }

  const chatName = chat.name || 'Чат';

  return (
    <>
      <div className="h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex flex-col">
        <div className="bg-white/5 backdrop-blur-sm border-b border-white/10 px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/chat')}
                className="text-white hover:text-purple-300 transition-colors cursor-pointer"
              >
                ← Назад
              </button>
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl">💬</span>
              </div>
              <h1 className="text-xl font-semibold text-white">{chatName}</h1>
            </div>
            {user && <span className="text-purple-200">{user.username}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="max-w-4xl mx-auto space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-purple-300 py-8">
                Нет сообщений. Напишите первое!
              </div>
            ) : (
              messages.map((msg) => {
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
                }

                const isOwn = msg.sender_id === user?.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        isOwn
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                          : 'bg-white/10 text-white'
                      }`}
                    >
                      {msg.is_sticker ? (
                        <span className="text-6xl block leading-none">{msg.content}</span>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <p className="text-xs opacity-70">{formattedDate}</p>
                        {isOwn && (
                          <span className="text-xs opacity-70">
                            {msg.is_read ? '✓✓' : '✓'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="border-t border-white/10 px-6 py-4">
          <form onSubmit={sendMessage} className="max-w-4xl mx-auto">
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={() => setShowStickerPicker(!showStickerPicker)}
                className="px-3 py-2 bg-white/10 rounded-xl text-2xl hover:bg-white/20 transition"
                title="Стикеры"
              >
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="24" 
                  height="24" 
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
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Введите сообщение..."
                className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/50 transition-all"
              />
              <button
                type="submit"
                className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300 cursor-pointer"
              >
                Отправить
              </button>
            </div>
          </form>
        </div>
      </div>

      {showStickerPicker && (
        <StickerPicker
          onSelectSticker={handleSendSticker}
          onClose={() => setShowStickerPicker(false)}
        />
      )}

      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-bold text-white">{modal.title}</h2>
              <p className="text-purple-200 mt-2">{modal.message}</p>
            </div>
            <button
              onClick={closeModal}
              className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}