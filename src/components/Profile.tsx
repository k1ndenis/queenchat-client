import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../lib/redux/hooks';
import { logout } from '../../lib/redux/slices/userSlice';
import { fetchWithAuth } from '../../lib/api';
import LoadingScreen from './LoadingScreen';
import Notifications from './Notifications';
import { translations } from '../../lib/locales';
import type { UserProfile } from '../types/user';

export default function Profile() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, language } = useAppSelector(state => state.user);
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
  const t = translations[language as keyof typeof translations];

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim() === '') {
      return t.emailRequired || 'Email обязателен для заполнения';
    }

    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return t.emailInvalid || 'Введите корректный email адрес';
    }

    if (email.length > 254) {
      return t.emailTooLong || 'Email не может быть длиннее 254 символов';
    }

    const localPart = email.split('@')[0];
    if (localPart.length > 64) {
      return t.emailLocalTooLong || 'Локальная часть email не может быть длиннее 64 символов';
    }

    const invalidPatterns = [
      /\.\./,
      /^\./,
      /\.$/,
      /^@/,
      /@.*@/,
    ];

    for (const pattern of invalidPatterns) {
      if (pattern.test(email)) {
        return t.emailInvalidFormat || 'Некорректный формат email адреса';
      }
    }

    // Проверка домена верхнего уровня (минимум 2 символа)
    const domain = email.split('@')[1];
    if (domain && !domain.includes('.') || (domain && domain.split('.').pop()?.length < 2)) {
      return t.emailInvalidDomain || 'Некорректный домен email адреса';
    }

    return null;
  };

  // Валидация username
  const validateUsername = (username: string): string | null => {
    if (!username || username.trim() === '') {
      return t.usernameRequired || 'Имя пользователя обязательно';
    }

    if (username.length < 3) {
      return t.usernameTooShort || 'Имя пользователя должно содержать минимум 3 символа';
    }

    if (username.length > 50) {
      return t.usernameTooLong || 'Имя пользователя не может быть длиннее 50 символов';
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return t.usernameInvalid || 'Имя пользователя может содержать только буквы, цифры, дефис и нижнее подчеркивание';
    }

    return null;
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

    const usernameError = validateUsername(username);
    if (usernameError) {
      setError(usernameError);
      return;
    }

    // Валидация email
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    // Проверка на изменения
    if (username === profile?.username && email === profile?.email) {
      setError(t.noChanges || 'Нет изменений для сохранения');
      return;
    }

    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/profile`, {
        method: 'PATCH',
        body: JSON.stringify({ username, email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = errorData.detail || t.usernameTaken || 'Ошибка обновления профиля';
        
        // Специфичные сообщения об ошибках от сервера
        if (errorMessage.toLowerCase().includes('email already exists')) {
          errorMessage = t.emailAlreadyExists || 'Этот email уже используется';
        } else if (errorMessage.toLowerCase().includes('invalid email')) {
          errorMessage = t.emailInvalid || 'Некорректный email адрес';
        } else if (errorMessage.toLowerCase().includes('username already taken')) {
          errorMessage = t.usernameTaken || 'Это имя пользователя уже занято';
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setProfile(data);
      setSuccess(t.profileUpdated || 'Профиль успешно обновлён');
      setIsEditing(false);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : t.error || 'Ошибка обновления');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    
    if (newEmail && !validateEmail(newEmail)) {
    }
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
                onClick={() => navigate('/chat')}
                className="text-white hover:text-purple-300 transition-colors cursor-pointer p-2 rounded-lg hover:bg-white/10"
                title={t.back}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12"/>
                  <polyline points="12 19 5 12 12 5"/>
                </svg>
              </button>
              <h1 className="text-xl font-semibold text-white">{t.profile}</h1>
            </div>
            <div className="flex items-center gap-4">
              <Notifications />
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 hover:text-red-200 transition cursor-pointer"
              >
                {t.logout}
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
                  <label className="block text-purple-200 text-sm mb-2">{t.username}</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className={`w-full px-4 py-2 bg-white/10 border rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 transition ${
                      error && error.includes('имя пользователя') 
                        ? 'border-red-500' 
                        : 'border-white/20'
                    }`}
                    required
                    minLength={3}
                    maxLength={50}
                    pattern="[a-zA-Z0-9_-]+"
                  />
                  <p className="text-purple-300/70 text-xs mt-1">
                    {t.usernameHint || 'Только буквы, цифры, дефис и нижнее подчеркивание (3-50 символов)'}
                  </p>
                </div>
                <div>
                  <label className="block text-purple-200 text-sm mb-2">{t.email}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={handleEmailChange}
                    className={`w-full px-4 py-2 bg-white/10 border rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 transition ${
                      error && error.includes('email') 
                        ? 'border-red-500' 
                        : 'border-white/20'
                    }`}
                    required
                    maxLength={254}
                  />
                  <p className="text-purple-300/70 text-xs mt-1">
                    {t.emailHint || 'Введите корректный email адрес (например, user@example.com)'}
                  </p>
                </div>
                {error && (
                  <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                    <p className="text-red-400 text-sm">{error}</p>
                  </div>
                )}
                {success && (
                  <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg">
                    <p className="text-green-400 text-sm">{success}</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 transition cursor-pointer"
                  >
                    {t.save}
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
                    {t.cancel}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.username}</span>
                  <span className="text-white font-medium">{profile?.username}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.email}</span>
                  <span className="text-white font-medium">{profile?.email}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.registrationDate}</span>
                  <span className="text-white font-medium">{formatDate(profile?.created_at || 0)}</span>
                </div>
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full mt-6 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                >
                  {t.editProfile}
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
              {t.ok}
            </button>
          </div>
        </div>
      )}
    </>
  );
}