import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from './../../lib/redux/hooks';
import { fetchWithAuth } from './../../lib/api';
import { socket } from './../../lib/socket';

interface Message {
  id: number;
  content: string;
  sender_id: number;
  chat_id: number;
  created_at: string;
}

interface ChatInfo {
  id: number;
  name?: string;
  other_user?: { username: string };
}

export default function ChatRoom() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAppSelector(state => state.user);
  const [chat, setChat] = useState<ChatInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    const loadChatData = async () => {
      try {
        const chatResponse = await fetchWithAuth(`http://localhost:8000/api/chats/${id}`);
        const chatData = await chatResponse.json();
        setChat(chatData);

        const messagesResponse = await fetchWithAuth(`http://localhost:8000/api/messages?chatId=${id}`);
        const messagesData = await messagesResponse.json();
        setMessages(Array.isArray(messagesData) ? messagesData : []);
      } catch (error) {
        console.error('Error loading chat:', error);
      } finally {
        setLoading(false);
      }
    };
    loadChatData();
  }, [id, user]);

  useEffect(() => {
    if (!user) return;

    socket.connect();

    const handleNewMessage = (newMsg: Message) => {
      if (newMsg.chat_id === Number(id)) {
        setMessages((prev) => [...prev, newMsg]);
      }
    };

    socket.on('new-message', handleNewMessage);

    return () => {
      socket.off('new-message', handleNewMessage);
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

    try {
      const response = await fetchWithAuth('http://localhost:8000/api/messages', {
        method: 'POST',
        body: JSON.stringify({
          chatId: Number(id),
          content: newMessage,
        }),
      });
      const data = await response.json();
      setMessages([...messages, data]);
      setNewMessage('');

      socket.emit('send-message', {
        ...data,
        chat_id: Number(id),
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

  const chatName = chat.name || chat.other_user?.username || 'Чат';

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
                const date = new Date(msg.created_at);
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