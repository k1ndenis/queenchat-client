import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../lib/redux/hooks';
import { logout, updateUser, updateAvatarVersion } from '../lib/redux/slices/userSlice';
import { fetchWithAuth, bumpAvatarVersion, getCurrentAvatarVersion } from '../lib/api';
import LoadingScreen from './LoadingScreen';
import Notifications from './Notifications';
import { translations } from '../lib/locales';
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;
  const t = translations[language as keyof typeof translations];
  const isMounted = useRef(true);

  const ADMIN_ID = 'd5540754-2973-4be5-aa6a-249b50fe2748';
  const isAdmin = user?.id === ADMIN_ID;

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  const updateAvatarPreview = useCallback((avatarUrl: string | null) => {
    if (!avatarUrl) {
      setAvatarPreview(null);
      return;
    }
    
    const baseUrl = avatarUrl.split('?')[0];
    const version = getCurrentAvatarVersion();
    setAvatarPreview(`${baseUrl}?v=${version}`);
  }, []);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === 'avatar_version' && event.newValue && isMounted.current) {
        dispatch(updateAvatarVersion(event.newValue));
        if (profile?.avatar) {
          const baseUrl = profile.avatar.split('?')[0];
          setAvatarPreview(`${baseUrl}?v=${event.newValue}`);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [dispatch, profile?.avatar]);

  useEffect(() => {
    if (profile?.avatar && !isAvatarLoading) {
      updateAvatarPreview(profile.avatar);
    } else if (!profile?.avatar) {
      setAvatarPreview(null);
    }
  }, [profile?.avatar, updateAvatarPreview, isAvatarLoading]);

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

    const domain = email.split('@')[1];
    if (domain && !domain.includes('.') || (domain && domain.split('.').pop()?.length < 2)) {
      return t.emailInvalidDomain || 'Некорректный домен email адреса';
    }

    return null;
  };

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

    const usernameRegex = /^[a-zA-Zа-яА-Я0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return t.usernameInvalid || 'Имя пользователя может содержать только буквы, цифры, дефис и нижнее подчеркивание';
    }

    return null;
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Можно загружать только изображения');
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      setError('Изображение не должно превышать 2MB');
      return;
    }
    
    setIsUploadingAvatar(true);
    setIsAvatarLoading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetchWithAuth(`${apiUrl}/files/upload-avatar`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload avatar');
      }
      
      const { url } = await response.json();
      
      const newVersion = bumpAvatarVersion();
      
      dispatch(updateUser({ avatar: url }));
      dispatch(updateAvatarVersion(newVersion));
      
      const baseUrl = url.split('?')[0];
      setAvatarPreview(`${baseUrl}?v=${newVersion}`);
      
      const profileResponse = await fetchWithAuth(`${apiUrl}/auth/me`);
      const profileData = await profileResponse.json();
      setProfile(profileData);
      
      setSuccess('Аватар обновлён');
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось загрузить аватар');
    } finally {
      setIsUploadingAvatar(false);
      setIsAvatarLoading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
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
        if (isMounted.current) {
          setProfile(data);
          setUsername(data.username);
          setEmail(data.email);
          
          if (data.avatar) {
            const baseUrl = data.avatar.split('?')[0];
            const version = getCurrentAvatarVersion();
            setAvatarPreview(`${baseUrl}?v=${version}`);
          }
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        if (isMounted.current) {
          setLoading(false);
        }
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

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

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

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      setError(t.deleteConfirmWrong || 'Введите DELETE для подтверждения');
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      const response = await fetchWithAuth(`${apiUrl}/auth/me`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || t.deleteFailed || 'Не удалось удалить аккаунт');
      }

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('avatar_version');
      dispatch(logout());
      
      setModal({
        isOpen: true,
        title: t.accountDeleted || 'Аккаунт удалён',
        message: t.accountDeletedMessage || 'Ваш аккаунт успешно удалён. До свидания!',
      });
      
      setTimeout(() => {
        navigate('/login');
      }, 2000);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : t.deleteFailed || 'Не удалось удалить аккаунт');
      setShowDeleteConfirm(false);
      setConfirmText('');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('avatar_version');
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
            <div className="relative">
              <div className="w-32 h-32 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-xl overflow-hidden">
                {isAvatarLoading ? (
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                ) : avatarPreview ? (
                  <img 
                    src={avatarPreview} 
                    alt="Avatar" 
                    className="w-full h-full object-cover"
                    key={avatarPreview}
                    onError={(e) => {
                      const img = e.target as HTMLImageElement;
                      if (!img.hasAttribute('data-retry')) {
                        img.setAttribute('data-retry', 'true');
                        const urlWithoutVersion = img.src.split('?')[0];
                        img.src = urlWithoutVersion;
                      } else {
                        setAvatarPreview(null);
                      }
                    }}
                    onLoad={() => {
                      console.log('Avatar loaded successfully');
                    }}
                  />
                ) : (
                  <span className="text-5xl text-white font-bold">
                    {profile?.username?.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 bg-purple-500 rounded-full p-2 shadow-lg hover:bg-purple-600 transition disabled:opacity-50"
                title="Изменить аватар"
              >
                {isUploadingAvatar ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                    <circle cx="12" cy="13" r="4"/>
                  </svg>
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
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
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">{profile?.username}</span>
                    {isAdmin && (
                      <span className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
                        ADMIN
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.email}</span>
                  <span className="text-white font-medium">{profile?.email}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.registrationDate}</span>
                  <span className="text-white font-medium">{formatDate(profile?.created_at || 0)}</span>
                </div>
                
                {/* Кнопка перехода на страницу публичного профиля */}
                <button
                  onClick={() => navigate(`/user/${user?.id}`)}
                  className="w-full mt-6 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                >
                  Смотреть публичный профиль
                </button>
                
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                >
                  {t.editProfile}
                </button>
                
                <div className="mt-8 pt-4 border-t border-red-500/30">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full px-4 py-2 bg-red-500/20 text-red-300 rounded-xl hover:bg-red-500/30 hover:text-red-200 transition cursor-pointer"
                  >
                    {t.deleteAccount || 'Удалить аккаунт'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-red-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">⚠️</span>
              </div>
              <h2 className="text-2xl font-bold text-white">{t.deleteAccount || 'Удалить аккаунт'}</h2>
              <p className="text-purple-200 mt-2">
                {t.deleteAccountWarning || 'Это действие необратимо. Все ваши чаты, сообщения и данные будут удалены навсегда.'}
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-purple-200 text-sm mb-2">
                {t.deleteConfirmInstruction || 'Введите DELETE для подтверждения'}
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-4 py-2 bg-white/10 border border-red-500/30 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-red-500 transition text-center font-mono"
              />
            </div>
            
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccount}
                disabled={isDeleting}
                className={`flex-1 px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition cursor-pointer ${
                  isDeleting ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isDeleting ? (t.deleting || 'Удаление...') : (t.delete || 'Удалить')}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setConfirmText('');
                  setError('');
                }}
                className="flex-1 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
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