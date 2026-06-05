import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../lib/redux/hooks';
import { logout } from '../../lib/redux/slices/userSlice';
import { fetchWithAuth } from '../../lib/api';
import LoadingScreen from './LoadingScreen';
import Notifications from './Notifications';
import type { UserProfile } from '../types/user';

export default function Profile() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector(state => state.user);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    if (!user) {
      navigate('/login');
      return;
    }

    const loadProfile = async () => {
      try {
        const response = await fetchWithAuth(`${apiUrl}/auth/me`);
        const data = await response.json();
        setProfile(data);
        setUsername(data.username);
        setEmail(data.email);
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user, navigate, apiUrl]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ username, email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Ошибка обновления профиля');
      }

      const data = await response.json();
      setProfile(data);
      setSuccess('Профиль успешно обновлён');
      setIsEditing(false);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Ошибка обновления');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="bg-white/5 backdrop-blur-sm border-b border-white/10 px-6 py-4">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="text-white hover:text-purple-300 transition-colors cursor-pointer"
              >
                ← Назад
              </button>
              <h1 className="text-xl font-semibold text-white">Профиль</h1>
            </div>
            <div className="flex items-center gap-4">
              <Notifications />
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 hover:text-red-200 transition cursor-pointer"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="flex justify-center mb-8">
            <div className="w-32 h-32 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-xl">
              <span className="text-5xl text-white font-bold">
                {profile?.username?.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            {isEditing ? (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-purple-200 text-sm mb-2">Имя пользователя</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 transition"
                    required
                  />
                </div>
                <div>
                  <label className="block text-purple-200 text-sm mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 transition"
                    required
                  />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                {success && <p className="text-green-400 text-sm">{success}</p>}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 transition cursor-pointer"
                  >
                    Сохранить
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setUsername(profile?.username || '');
                      setEmail(profile?.email || '');
                      setError('');
                    }}
                    className="flex-1 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                  >
                    Отмена
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">Имя пользователя</span>
                  <span className="text-white font-medium">{profile?.username}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">Email</span>
                  <span className="text-white font-medium">{profile?.email}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">Дата регистрации</span>
                  <span className="text-white font-medium">{formatDate(profile?.created_at || 0)}</span>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full mt-6 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                >
                  Редактировать профиль
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

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