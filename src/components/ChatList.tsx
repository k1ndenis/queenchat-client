import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../lib/api';
import { useAppSelector, useAppDispatch } from '../../lib/redux/hooks';
import { logout } from '../../lib/redux/slices/userSlice';

interface Chat {
  id: string;
  name: string | null;
  is_group: boolean;
  participants: { user_id: string; username: string }[];
}

export default function ChatList() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector(state => state.user);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [error, setError] = useState('');
  const apiUrl = import.meta.env.VITE_API_URL;

  useEffect(() => {
    if (!user) return;

    const loadChats = async () => {
      try {
        const response = await fetchWithAuth(`${apiUrl}/chats/`);
        const data = await response.json();
        setChats(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error loading chats:', error);
        setChats([]);
      } finally {
        setLoading(false);
      }
    };
    loadChats();
  }, [user, apiUrl]);

  const handleCreateChat = async () => {
    if (!usernameInput.trim()) {
      setError('Введите имя пользователя');
      return;
    }
    
    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/`, {
        method: 'POST',
        body: JSON.stringify({
          name: null,
          is_group: false,
          participant_ids: [usernameInput.trim()]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Пользователь не найден');
      }
      
      const newChat = await response.json();
      setIsModalOpen(false);
      setUsernameInput('');
      setError('');
      navigate(`/chat/${newChat.id}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      setError(error instanceof Error ? error.message : 'Пользователь не найден');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
        <div className="text-white">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Мои чаты</h1>
            <p className="text-purple-300 text-sm">Привет, {user?.username}!</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90"
            >
              + Новый чат
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 hover:text-red-200 transition"
            >
              Выйти
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {chats.length === 0 ? (
            <div className="text-center text-purple-300 py-8">
              У вас пока нет чатов. Создайте первый!
            </div>
          ) : (
            chats.map(chat => {
              let displayName = chat.name;
              if (!displayName && !chat.is_group) {
                const otherUser = chat.participants.find(p => p.username !== user?.username);
                displayName = otherUser?.username || 'Чат';
              }
              return (
                <div
                  key={chat.id}
                  onClick={() => navigate(`/chat/${chat.id}`)}
                  className="bg-white/10 backdrop-blur-sm rounded-xl p-4 hover:bg-white/20 cursor-pointer transition"
                >
                  <h3 className="text-white font-semibold">{displayName}</h3>
                  <p className="text-purple-300 text-sm">
                    {chat.is_group ? '👥 Групповой чат' : '💬 Личный чат'}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <h2 className="text-2xl font-bold text-white mb-4">Новый чат</h2>
            <p className="text-purple-200 mb-4">Введите имя пользователя для начала общения</p>
            
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => {
                setUsernameInput(e.target.value);
                setError('');
              }}
              placeholder="Имя пользователя"
              className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateChat();
              }}
            />
            
            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={handleCreateChat}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90"
              >
                Создать
              </button>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setUsernameInput('');
                  setError('');
                }}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}