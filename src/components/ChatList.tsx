import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../lib/api';
import { useAppSelector, useAppDispatch } from '../../lib/redux/hooks';
import { logout } from '../../lib/redux/slices/userSlice';
import type { Chat } from '../types/chat';
import LoadingScreen from './LoadingScreen';

interface User {
  id: string;
  username: string;
  email: string;
}

export default function ChatList() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector(state => state.user);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [error, setError] = useState('');
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const apiUrl = import.meta.env.VITE_API_URL;

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

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

  useEffect(() => {
    if (!isModalOpen) return;

    const loadUsers = async () => {
      try {
        const response = await fetchWithAuth(`${apiUrl}/auth/get_users`);
        const data = await response.json();
        if (Array.isArray(data)) {
          const otherUsers = data.filter((u: User) => u.id !== user?.id);
          setUsers(otherUsers);
          setFilteredUsers(otherUsers);
        } else {
          console.error('Expected array, got:', typeof data);
          setUsers([]);
          setFilteredUsers([]);
        }
      } catch (error) {
        console.error('Error loading users:', error);
        setError('Не удалось загрузить список пользователей');
      }
    };
    loadUsers();
  }, [isModalOpen, apiUrl, user?.id]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(u => 
        u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [searchQuery, users]);

  const handleCreateChat = async () => {
    if (!selectedUser) {
      setError('Выберите пользователя');
      return;
    }
    
    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/`, {
        method: 'POST',
        body: JSON.stringify({
          name: null,
          is_group: false,
          participant_ids: [selectedUser.username]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Не удалось создать чат');
      }
      
      const newChat = await response.json();
      setIsModalOpen(false);
      setSearchQuery('');
      setSelectedUser(null);
      setError('');
      navigate(`/chat/${newChat.id}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      setError(error instanceof Error ? error.message : 'Не удалось создать чат');
    }
  };

  const handleDeleteChat = async () => {
    if (!deleteChatId) return;
    
    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${deleteChatId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete chat');
      }
      
      setChats(chats.filter(chat => chat.id !== deleteChatId));
      setDeleteChatId(null);
    } catch (error) {
      console.error('Error deleting chat:', error);
      setModal({
        isOpen: true,
        title: 'Ошибка',
        message: 'Не удалось удалить чат',
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
  };

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <>
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
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:opacity-90 cursor-pointer"
              >
                + Новый чат
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 hover:text-red-200 transition cursor-pointer"
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
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-4 hover:bg-white/20 transition group"
                  >
                    <div className="flex justify-between items-center">
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => navigate(`/chat/${chat.id}`)}
                      >
                        <h3 className="text-white font-semibold">{displayName}</h3>
                        <p className="text-purple-300 text-sm">
                          {chat.is_group ? 'Групповой чат' : 'Личный чат'}
                        </p>
                      </div>
                      <button
                        onClick={() => setDeleteChatId(chat.id)}
                        className="text-red-400/60 hover:text-red-400 transition-all duration-200 p-2 cursor-pointer rounded-lg hover:bg-white/10"
                        title="Удалить чат"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
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
              <p className="text-purple-200 mb-4">Выберите пользователя для начала общения</p>
              
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по имени"
                className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
                autoFocus
              />
              
              <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
                {filteredUsers.length === 0 ? (
                  <p className="text-purple-300 text-center py-4">
                    {searchQuery ? 'Пользователи не найдены' : 'Нет других пользователей'}
                  </p>
                ) : (
                  filteredUsers.map(u => (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={`p-3 rounded-lg cursor-pointer transition ${
                        selectedUser?.id === u.id
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                          : 'bg-white/10 hover:bg-white/20'
                      }`}
                    >
                      <p className="text-pink-300 font-medium">{u.username}</p>
                    </div>
                  ))
                )}
              </div>
              
              {error && (
                <p className="text-red-400 text-sm mb-4">{error}</p>
              )}
              
              <div className="flex gap-3">
                <button
                  onClick={handleCreateChat}
                  disabled={!selectedUser}
                  className={`flex-1 px-4 py-2 rounded-lg transition ${
                    selectedUser
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90 cursor-pointer'
                      : 'bg-white/20 text-white/50 cursor-not-allowed'
                  }`}
                >
                  Создать чат
                </button>
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setSearchQuery('');
                    setSelectedUser(null);
                    setError('');
                  }}
                  className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteChatId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-slate-800 to-red-900 rounded-2xl p-6 w-full max-w-md mx-4">
              <h2 className="text-2xl font-bold text-white mb-4">Удалить чат?</h2>
              <p className="text-purple-200 mb-6">Все сообщения будут удалены без возможности восстановления.</p>
              
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteChat}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
                >
                  Удалить
                </button>
                <button
                  onClick={() => setDeleteChatId(null)}
                  className="flex-1 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition cursor-pointer"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
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
                className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-xl hover:opacity-90 transition cursor-pointer"
              >
                Понятно
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}