import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppSelector } from '../lib/redux/hooks';
import { fetchWithAuth } from '../lib/api';
import { translations } from '../lib/locales';
import LoadingScreen from './LoadingScreen';
import Notifications from './Notifications';
import UserMenu from './UserMenu';
import ImageViewer from './ImageViewer';
import type { User } from '../types/user';

export default function UserProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: currentUser, language } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number>(0);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  // ID администратора
  const ADMIN_ID = 'd5540754-2973-4be5-aa6a-249b50fe2748';

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const loadUserProfile = async () => {
      try {
        const response = await fetchWithAuth(`/auth/users/${userId}`);
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Пользователь не найден');
          }
          throw new Error('Ошибка загрузки профиля');
        }
        const data = await response.json();
        setUser(data);
      } catch (error) {
        console.error('Error loading user profile:', error);
        setError(error instanceof Error ? error.message : 'Не удалось загрузить профиль пользователя');
      } finally {
        setLoading(false);
      }
    };

    loadUserProfile();
  }, [userId, currentUser, navigate]);

  const handleStartChat = async () => {
    if (!user) return;
    
    setIsCreatingChat(true);
    try {
      const response = await fetchWithAuth(`/chats/`, {
        method: 'POST',
        body: JSON.stringify({
          name: null,
          is_group: false,
          participant_ids: [user.username]
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Не удалось создать чат');
      }
      
      const newChat = await response.json();
      navigate(`/chat/${newChat.id}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      setModal({
        isOpen: true,
        title: t.error || 'Ошибка',
        message: error instanceof Error ? error.message : 'Не удалось создать чат',
      });
    } finally {
      setIsCreatingChat(false);
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '—';
    return new Date(timestamp * 1000).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return <LoadingScreen />;
  }

  if (error || !user) {
    return (
      <>
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
          <div className="sticky top-0 z-10 bg-white/5 backdrop-blur-sm border-b border-white/10 px-6 py-4">
            <div className="max-w-4xl mx-auto flex items-center justify-between">
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
                <h1 className="text-xl font-semibold text-white">{t.userProfile || 'Профиль пользователя'}</h1>
              </div>
              <div className="flex items-center gap-4">
                <Notifications />
                <UserMenu username={currentUser?.username || ''} email={currentUser?.email || ''} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center h-[calc(100vh-80px)]">
            <div className="text-center">
              <div className="text-red-400 text-xl mb-4">{error || 'Пользователь не найден'}</div>
              <button
                onClick={() => navigate('/chat')}
                className="px-6 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition cursor-pointer"
              >
                {t.backToChats || 'Вернуться к чатам'}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const isOwnProfile = currentUser?.id === user.id;
  const isAdmin = user.id === ADMIN_ID;

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="sticky top-0 z-10 bg-white/5 backdrop-blur-sm border-b border-white/10 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="text-white hover:text-purple-300 transition-colors cursor-pointer p-2 rounded-lg hover:bg-white/10"
                title={t.back}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-white">
                {isOwnProfile ? t.myProfile || 'Мой профиль' : t.userProfile || 'Профиль пользователя'}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <Notifications />
              <UserMenu username={currentUser?.username || ''} email={currentUser?.email || ''} />
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
            {/* Аватар с возможностью увеличения */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div 
                  onClick={() => {
                    if (user.avatar) {
                      setViewerImages([user.avatar]);
                      setViewerIndex(0);
                    }
                  }}
                  className={`w-32 h-32 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center shadow-xl overflow-hidden ${
                    user.avatar ? 'cursor-pointer hover:opacity-90 transition' : ''
                  }`}
                >
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-5xl text-white font-bold">
                      {user.username?.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {user.avatar && (
                  <div className="absolute bottom-0 right-0 bg-black/50 rounded-full p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-3" />
                      <polyline points="18 8 22 8 22 12" />
                      <line x1="8" y1="21" x2="22" y2="7" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Информация о пользователе */}
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-purple-200">{t.username}</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">{user.username}</span>
                  {isAdmin && (
                    <span className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
                      ADMIN
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-purple-200">{t.email}</span>
                <span className="text-white font-medium">{user.email}</span>
              </div>
              
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-purple-200">{t.registrationDate}</span>
                <span className="text-white font-medium">{formatDate(user.created_at)}</span>
              </div>
            </div>

            {/* Кнопки действий */}
            <div className="mt-8 space-y-3">
              {!isOwnProfile && (
                <button
                  onClick={handleStartChat}
                  disabled={isCreatingChat}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCreatingChat ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      {t.creating || 'Создание...'}
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      {t.sendMessage || 'Написать сообщение'}
                    </>
                  )}
                </button>
              )}
              
              <button
                onClick={() => navigate('/chat')}
                className="w-full px-6 py-3 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
              >
                {t.backToChats || 'Вернуться к чатам'}
              </button>
            </div>
          </div>
        </div>
      </div>

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
    </>
  );
}