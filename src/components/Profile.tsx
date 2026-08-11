import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../lib/redux/hooks';
import { logout, updateUser, updateAvatarVersion } from '../lib/redux/slices/userSlice';
import { fetchWithAuth, bumpAvatarVersion, getCurrentAvatarVersion } from '../lib/api';
import LoadingScreen from './LoadingScreen';
import { translations } from '../lib/locales';
import type { UserProfile } from '../types/user';
import PhoneInput from './PhoneInput';
import { removeFCMToken } from '../lib/firebase';
import { clearUserCache } from '../lib/cache';
import { getUserDisplayName, getUserUsernameLabel } from '../lib/userDisplay';
import { Capacitor } from '@capacitor/core';
import { APK_URL, shareQueenChat } from '../lib/share';
import AvatarCropModal from './AvatarCropModal';

export default function Profile() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, language } = useAppSelector(state => state.user);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
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
  const [avatarFileToCrop, setAvatarFileToCrop] = useState<File | null>(null);
  
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const apiUrl = import.meta.env.VITE_API_URL;
  const t = translations[language as keyof typeof translations];
  const isMounted = useRef(true);

  const ADMIN_ID = '33f676d7-9ab6-4eaa-b3c4-d4552b499f58';
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

  const validateUsername = (username: string): string | null => {
    if (!username || username.trim() === '') {
      return t.usernameRequired;
    }

    if (username.length < 3) {
      return t.usernameTooShort;
    }

    if (username.length > 30) {
      return t.usernameTooLong;
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      return t.usernameInvalid;
    }

    return null;
  };

  const validateDisplayName = (name: string): string | null => {
    if (name && name.length > 100) {
      return t.displayNameTooLong;
    }
    return null;
  };

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim() === '') {
      return null; // Email необязательный, возвращаем null
    }

    if (typeof email !== 'string') {
      return t.emailMustBeString;
    }

    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return t.emailInvalid;
    }

    if (email.length > 254) {
      return t.emailTooLong;
    }

    return null;
  };

  const uploadAvatar = async (file: File) => {
    
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
        throw new Error(errorData.detail || t.avatarUploadFailed);
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
      setDisplayName(profileData.display_name || profileData.username);
      setPhone(profileData.phone || '');
      setEmail(profileData.email || '');
      
      setSuccess(t.avatarUpdated);
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : t.avatarUploadFailed);
    } finally {
      setIsUploadingAvatar(false);
      setIsAvatarLoading(false);
    }
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (avatarInputRef.current) avatarInputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t.imageOnly);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError(t.imageTooLarge);
      return;
    }
    setError('');
    setAvatarFileToCrop(file);
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
          setDisplayName(data.display_name || data.username);
          setPhone(data.phone || '');
          setEmail(data.email || '');
          
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

    const displayNameError = validateDisplayName(displayName);
    if (displayNameError) {
      setError(displayNameError);
      return;
    }

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    try {
      const updateData: any = {};
      if (username !== profile?.username) updateData.username = username;
      if (displayName !== (profile?.display_name || profile?.username)) updateData.display_name = displayName;
      if (email !== (profile?.email || '')) updateData.email = email || null;
      if (phone !== profile?.phone) updateData.phone = phone;

      if (Object.keys(updateData).length === 0) {
        setError(t.noChanges);
        return;
      }

      const response = await fetchWithAuth(`${apiUrl}/auth/profile`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        let errorMessage = errorData.detail || t.profileUpdateFailed;
        
        if (errorMessage.toLowerCase().includes('username already taken')) {
          errorMessage = t.usernameTaken;
        } else if (errorMessage.toLowerCase().includes('phone already taken')) {
          errorMessage = t.phoneTaken;
        } else if (errorMessage.toLowerCase().includes('email already exists')) {
          errorMessage = t.emailAlreadyExists;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      setProfile(data);
      setDisplayName(data.display_name || data.username);
      setEmail(data.email || '');
      setPhone(data.phone || '');
      
      dispatch(updateUser({ 
        username: data.username,
        display_name: data.display_name,
        email: data.email,
        phone: data.phone
      }));
      
      setIsEditing(false);
      setSuccess(t.profileUpdated);
      setTimeout(() => setSuccess(''), 3000);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : t.profileUpdateFailed);
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmText !== 'DELETE') {
      setError(t.deleteConfirmWrong);
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
        throw new Error(errorData.detail || t.deleteFailed);
      }

      await removeFCMToken();
      if (user) await clearUserCache(user.id);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('avatar_version');
      dispatch(logout());
      
      setModal({
        isOpen: true,
        title: t.accountDeleted,
        message: t.accountDeletedMessage,
      });
      
      setTimeout(() => {
        navigate('/login');
      }, 2000);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : t.deleteFailed);
      setShowDeleteConfirm(false);
      setConfirmText('');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogout = async () => {
    await removeFCMToken();
    if (user) await clearUserCache(user.id);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('avatar_version');
    dispatch(logout());
    navigate('/login');
  };

  const handleShare = async () => {
    try {
      const result = await shareQueenChat(language as 'ru' | 'en');
      if (result === 'copied') {
        setSuccess(t.shareCopied);
        window.setTimeout(() => setSuccess(''), 3000);
      }
    } catch (error) {
      console.error('Unable to share QueenChat:', error);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-US', {
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
                    alt={t.avatarPreview} 
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
                  />
                ) : (
                  <span className="text-5xl text-white font-bold">
                    {getUserDisplayName(profile, t.userUnknown).charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="absolute bottom-0 right-0 bg-purple-500 rounded-full p-2 shadow-lg hover:bg-purple-600 transition disabled:opacity-50"
                title={t.changeAvatar}
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
                onChange={handleAvatarFileSelect}
                className="hidden"
              />
            </div>
          </div>
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-white">{getUserDisplayName(profile, t.userUnknown)}</h1>
            {getUserUsernameLabel(profile) && <p className="mt-1 text-sm text-purple-300">{getUserUsernameLabel(profile)}</p>}
          </div>

          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            {isEditing ? (
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className="block text-purple-200 text-sm mb-2">{t.displayNameLabel}</label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t.displayNamePlaceholder}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 transition"
                    maxLength={100}
                  />
                  <p className="text-purple-300/70 text-xs mt-1">
                    {t.displayNameHint}
                  </p>
                </div>
                <div>
                  <label className="block text-purple-200 text-sm mb-2">{t.username}</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t.usernamePlaceholder}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 transition"
                    required
                    pattern="[a-zA-Z0-9_-]+"
                  />
                  <p className="text-purple-300/70 text-xs mt-1">
                    {t.usernameHint}
                  </p>
                </div>
                <div>
                  <label className="block text-purple-200 text-sm mb-2">{t.phoneLabel}</label>
                  <PhoneInput
                    value={phone}
                    onChange={setPhone}
                  />
                  <p className="text-purple-300/70 text-xs mt-1">
                    {t.phoneHint}
                  </p>
                </div>
                <div>
                  <label className="block text-purple-200 text-sm mb-2">{t.emailOptionalLabel}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t.emailPlaceholder}
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white placeholder-purple-300/50 focus:outline-none focus:border-purple-500 transition"
                  />
                  <p className="text-purple-300/70 text-xs mt-1">
                    {t.emailHint}
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
                      setDisplayName(profile?.display_name || profile?.username || '');
                      setPhone(profile?.phone || '');
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
                  <span className="text-purple-200">{t.displayNameLabel}</span>
                  <span className="text-white font-medium">{getUserDisplayName(profile, t.userUnknown)}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.username}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium">@{profile?.username}</span>
                    {isAdmin && (
                      <span className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
                        {t.admin}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.phoneLabel}</span>
                  <span className="text-white font-medium">{profile?.phone || t.notProvided}</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.email}</span>
                  <span className="text-white font-medium">
                    {profile?.email ? profile.email : t.notProvided}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-white/10">
                  <span className="text-purple-200">{t.registrationDate}</span>
                  <span className="text-white font-medium">{formatDate(profile?.created_at || 0)}</span>
                </div>
                
                <button
                  onClick={() => navigate(`/user/${profile?.username}`)}
                  className="w-full mt-6 px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                >
                  {t.viewProfile}
                </button>
                
                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full px-4 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition cursor-pointer"
                >
                  {t.editProfile}
                </button>

                <div className="mt-6 rounded-xl border border-purple-300/20 bg-gradient-to-r from-purple-500/15 to-pink-500/15 p-4">
                  <button
                    onClick={() => void handleShare()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 px-4 py-2.5 font-medium text-white shadow-lg transition hover:opacity-90 cursor-pointer"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                    {t.inviteFriends}
                  </button>
                  {!Capacitor.isNativePlatform() && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <p className="mb-3 text-center text-sm text-purple-100">{t.androidApp}</p>
                      <a
                        href={APK_URL}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 font-medium text-white transition hover:bg-white/20"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>
                        {t.downloadApk}
                      </a>
                    </div>
                  )}
                  {success && (
                    <p className="mt-3 text-center text-sm text-green-300">{success}</p>
                  )}
                </div>
                
                <div className="mt-8 pt-4 border-t border-red-500/30">
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full px-4 py-2 bg-red-500/20 text-red-300 rounded-xl hover:bg-red-500/30 hover:text-red-200 transition cursor-pointer"
                  >
                    {t.deleteAccount}
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
              <h2 className="text-2xl font-bold text-white">{t.deleteAccount}</h2>
              <p className="text-purple-200 mt-2">
                {t.deleteAccountWarning}
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-purple-200 text-sm mb-2">
                {t.deleteConfirmInstruction}
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
                {isDeleting ? t.deleting : t.delete}
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

      {avatarFileToCrop && (
        <AvatarCropModal
          file={avatarFileToCrop}
          language={language}
          onCancel={() => setAvatarFileToCrop(null)}
          onSave={async croppedFile => {
            await uploadAvatar(croppedFile);
            setAvatarFileToCrop(null);
          }}
        />
      )}
    </>
  );
}
