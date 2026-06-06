import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth } from '../../lib/api';
import { useAppSelector, useAppDispatch } from '../../lib/redux/hooks';
import { translations } from '../../lib/locales';
import type { Chat } from '../types/chat';
import type { User } from '../types/user';
import type { LastMessage } from '../types/message';
import LoadingScreen from './LoadingScreen';
import Notifications from './Notifications';
import UserMenu from './UserMenu';

export default function ChatList() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, language } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  const [chats, setChats] = useState<Chat[]>([]);
  const [lastMessages, setLastMessages] = useState<Map<string, LastMessage>>(new Map());
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

  const loadLastMessage = async (chatId: string) => {
    try {
      const response = await fetchWithAuth(`${apiUrl}/chats/${chatId}/messages?limit=1&order=desc`);
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const msg = data[0];
        setLastMessages(prev => new Map(prev).set(chatId, {
          id: msg.id,
          content: msg.content,
          created_at: msg.created_at,
          sender_id: msg.sender_id,
          sender_name: msg.sender_name
        }));
        return msg.created_at;
      }
    } catch (error) {
      console.error('Error loading last message:', error);
    }
    return null;
  };

  useEffect(() => {
    if (!user) return;

    const loadChats = async () => {
      try {
        const response = await fetchWithAuth(`${apiUrl}/chats/`);
        const data = await response.json();
        if (Array.isArray(data)) {
          const chatsWithTime = await Promise.all(
            data.map(async (chat: Chat) => {
              const lastMsgTime = await loadLastMessage(chat.id);
              return { ...chat, lastMsgTime: lastMsgTime || chat.updated_at || 0 };
            })
          );
          
          const sortedChats = chatsWithTime.sort((a, b) => b.lastMsgTime - a.lastMsgTime);
          setChats(sortedChats);
        }
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
    if (chats.length === 0) return;
    
    chats.forEach(chat => {
      if (!lastMessages.has(chat.id)) {
        loadLastMessage(chat.id);
      }
    });
  }, [chats]);

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
        setError(t.failedToLoadUsers || 'Не удалось загрузить список пользователей');
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
      setError(t.selectUser || 'Выберите пользователя');
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
        throw new Error(errorData.detail || t.failedToCreateChat || 'Не удалось создать чат');
      }
      
      const newChat = await response.json();
      setIsModalOpen(false);
      setSearchQuery('');
      setSelectedUser(null);
      setError('');
      navigate(`/chat/${newChat.id}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      setError(error instanceof Error ? error.message : (t.failedToCreateChat || 'Не удалось создать чат'));
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
      setLastMessages(prev => {
        const newMap = new Map(prev);
        newMap.delete(deleteChatId);
        return newMap;
      });
      setDeleteChatId(null);
    } catch (error) {
      console.error('Error deleting chat:', error);
      setModal({
        isOpen: true,
        title: t.error || 'Ошибка',
        message: t.failedToDeleteChat || 'Не удалось удалить чат',
      });
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = diff / (1000 * 60 * 60);
    
    if (hours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (hours < 48) {
      return t.yesterday || 'Вчера';
    } else {
      return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
    }
  };

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-end items-center gap-3 mb-4">
            <Notifications />
            <UserMenu username={user?.username || ''} email={user?.email || ''} />
          </div>

          <div className="mb-6">
            <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                    <span className="text-white text-lg font-medium">
                      {user?.username?.[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-purple-300 text-xs">{t.account || 'Аккаунт'}</p>
                    <p className="text-white font-semibold">{user?.username}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-purple-300 text-xs">{t.totalChats || 'Всего чатов'}</p>
                  <p className="text-white font-semibold">{chats.length}</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 shadow-lg flex items-center justify-center hover:scale-105 transition z-50"
              title={t.newChat || 'Новый чат'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>

          <div className="space-y-2">
            {chats.length === 0 ? (
              <div className="text-center text-purple-300 py-8">
                {t.noChats || 'У вас пока нет чатов. Создайте первый!'}
              </div>
            ) : (
              chats.map(chat => {
                let displayName = chat.name;
                let avatarLetter = '';
                if (!displayName && !chat.is_group) {
                  const otherUser = chat.participants.find(p => p.username !== user?.username);
                  displayName = otherUser?.username || t.chat || 'Чат';
                  avatarLetter = otherUser?.username?.[0]?.toUpperCase() || 'Ч';
                } else {
                  avatarLetter = displayName?.[0]?.toUpperCase() || 'Ч';
                }
                
                const lastMsg = lastMessages.get(chat.id);
                const isOwn = lastMsg?.sender_id === user?.id;
                const msgPreview = lastMsg?.content || t.noMessages || 'Нет сообщений';
                
                return (
                  <div
                    key={chat.id}
                    className="bg-white/10 backdrop-blur-sm rounded-xl p-3 hover:bg-white/20 transition-all duration-200 cursor-pointer group"
                    onClick={() => navigate(`/chat/${chat.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-md flex-shrink-0">
                        <span className="text-white font-medium text-base">
                          {avatarLetter}
                        </span>
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline gap-2">
                          <h3 className="text-white font-semibold truncate">{displayName}</h3>
                          {lastMsg && (
                            <span className="text-purple-400 text-xs flex-shrink-0">
                              {formatTime(lastMsg.created_at)}
                            </span>
                          )}
                        </div>
                        <p className="text-purple-300 text-sm truncate">
                          {isOwn && <span className="text-purple-400 mr-1">{t.you || 'Вы'}: </span>}
                          {msgPreview}
                        </p>
                      </div>
                      
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteChatId(chat.id);
                        }}
                        className="text-red-400/50 hover:text-red-400 transition-all duration-200 p-2 rounded-lg hover:bg-white/10 flex-shrink-0"
                        title={t.deleteChat || 'Удалить чат'}
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
              <h2 className="text-2xl font-bold text-white mb-4">{t.newChat}</h2>
              <p className="text-purple-200 mb-4">{t.selectUser}</p>
              
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchUser}
                className="w-full px-4 py-2 bg-white/10 border border-purple-300/30 rounded-lg text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 mb-4"
                autoFocus
              />
              
              <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
                {filteredUsers.length === 0 ? (
                  <p className="text-purple-300 text-center py-4">
                    {searchQuery ? t.userNotFound : t.noUsers}
                  </p>
                ) : (
                  filteredUsers.map(u => (
                    <div
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={`p-3 rounded-lg cursor-pointer transition flex items-center gap-3 ${
                        selectedUser?.id === u.id
                          ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                          : 'bg-white/10 hover:bg-white/20'
                      }`}
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-500/30 flex items-center justify-center">
                        <span className="text-white text-sm font-medium">
                          {u.username?.[0]?.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-white font-medium">{u.username}</p>
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
                  {t.createChat}
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
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        )}

        {deleteChatId && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gradient-to-br from-slate-800 to-red-900 rounded-2xl p-6 w-full max-w-md mx-4">
              <h2 className="text-2xl font-bold text-white mb-4">{t.deleteChat}</h2>
              <p className="text-purple-200 mb-6">{t.deleteChatWarning}</p>
              
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteChat}
                  className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition cursor-pointer"
                >
                  {t.delete}
                </button>
                <button
                  onClick={() => setDeleteChatId(null)}
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
                {t.ok}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}