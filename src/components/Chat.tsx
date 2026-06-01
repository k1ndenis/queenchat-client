import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../../lib/redux/hooks';
import { fetchWithAuth } from '../../lib/api';
import { socket } from '../../lib/socket';

interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string;
  created_at: number;
}

interface ChatInfo {
  id: string;
  name?: string;
  is_group: boolean;
  created_by: string;
  participants?: { user_id: string; username: string }[];
}

export default function ChatRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAppSelector(state => state.user);
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!id || id === 'undefined') {
      console.error('Invalid chat ID');
      navigate('/chat');
      return;
    }
  }, [id, navigate]);

  useEffect(() => {
    if (!user || !id || id === 'undefined') return;

    const loadChatData = async () => {
      try {
        const chatResponse = await fetchWithAuth(`${apiUrl}/chats/${id}`);
        if (!chatResponse.ok) {
          throw new Error('Failed to load chat');
        }
        const chatData = await chatResponse.json();
        setChat(chatData);

        const messagesResponse = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`);
        if (messagesResponse.ok) {
          const messagesData = await messagesResponse.json();
          setMessages(Array.isArray(messagesData) ? messagesData.reverse() : []);
        }
      } catch (error) {
        console.error('Error loading chat:', error);
        navigate('/chat');
      } finally {
        setLoading(false);
      }
    };
    loadChatData();
  }, [id, user, apiUrl, navigate]);

  useEffect(() => {
    if (!user || !id) return;

    const initWebSocket = async () => {
      await socket.connectToChat(id);
    };
    
    initWebSocket();

    const handleNewMessage = (newMsg: Message) => {
      if (newMsg.chat_id === id) {
        setMessages((prev) => [...prev, newMsg]);
      } else {
      }
    };

    socket.on('new-message', handleNewMessage);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.disconnect();
    };
  }, [id, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('Пользователь не авторизован');
      return;
    }
    if (!newMessage.trim()) return;
    if (!id || id === 'undefined') {
      alert('Invalid chat ID');
      return;
    }

    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: newMessage,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send message');
      }

      const data = await response.json();
      setMessages([...messages, data]);
      setNewMessage('');

      socket.emit('send-message', {
        ...data,
        chat_id: id,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Не удалось отправить сообщение');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Загрузка...</div>
      </div>
    );
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
              } catch (error) {
                console.error(error);
              }
              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                      msg.sender_id === user?.id
                        ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                        : 'bg-white/10 text-white'
                    }`}
                  >
                    <p>{msg.content}</p>
                    <p className="text-xs opacity-70 mt-1">{formattedDate}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-white/10 px-6 py-4">
        <form onSubmit={sendMessage} className="max-w-4xl mx-auto flex gap-3">
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
        </form>
      </div>
    </div>
  );
}