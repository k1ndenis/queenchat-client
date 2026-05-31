import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from './../../lib/api';
import { useAppSelector } from './../../lib/redux/hooks';

interface Chat {
  id: string;
  name: string | null;
  is_group: boolean;
  participants: { user_id: string; username: string }[];
}

export default function ChatList() {
  const navigate = useNavigate();
  const { user } = useAppSelector(state => state.user);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

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

  const createNewChat = async () => {
    const userId = prompt('Введите имя пользователя для чата:');
    if (!userId) return;
    
    try {
        const response = await fetchWithAuth(`${apiUrl}/chats/`, {
        method: 'POST',
        body: JSON.stringify({
            name: null,
            is_group: false,
            participant_ids: [userId]
        })
        });
        const newChat = await response.json();
        navigate(`/chat/${newChat.id}`);
    } catch (error) {
        console.error('Error creating chat:', error);
        alert('Пользователь не найден');
    }
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
          <h1 className="text-2xl font-bold text-white">Мои чаты</h1>
          <button
            onClick={createNewChat}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90"
          >
            + Новый чат
          </button>
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
    </div>
  );
}