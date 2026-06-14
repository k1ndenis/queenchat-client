import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../lib/redux/hooks';
import { logout, setLanguage } from '../lib/redux/slices/userSlice';
import LoadingScreen from './LoadingScreen';
import { translations } from '../lib/locales';

async function subscribeToPush() {
  try {
    const vapidResp = await fetch('/api/notifications/vapid-public-key');
    const { publicKey } = await vapidResp.json();
    
    if (!publicKey) {
      console.error('No VAPID public key');
      return false;
    }
    
    function urlBase64ToUint8Array(base64String: string) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }
    
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    
    const response = await fetch('/api/notifications/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });
    
    if (response.ok) {
      console.log('Push subscription successful');
      return true;
    }
  } catch (error) {
    console.error('Push subscription failed:', error);
  }
  return false;
}

async function unsubscribeFromPush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await fetch('/api/notifications/push-unsubscribe', { method: 'POST' });
      console.log('Push unsubscribed');
      return true;
    }
  } catch (error) {
    console.error('Push unsubscribe failed:', error);
  }
  return false;
}

export default function Settings() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, language: reduxLanguage } = useAppSelector(state => state.user);
  const [loading, setLoading] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState(reduxLanguage);
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const t = translations[selectedLanguage as keyof typeof translations];

  const closeModal = () => {
    setModal({ isOpen: false, title: '', message: '' });
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const savedSettings = localStorage.getItem('queenchat_settings');
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      if (settings.language) {
        setSelectedLanguage(settings.language);
      }
    }
    
    const checkPushSubscription = async () => {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          setIsPushSubscribed(!!subscription);
        } catch (error) {
          console.error('Error checking subscription:', error);
        }
      }
    };
    checkPushSubscription();
    
    setLoading(false);
  }, [user, navigate]);

  const handleTogglePush = async () => {
    if (isPushSubscribed) {
      const success = await unsubscribeFromPush();
      if (success) setIsPushSubscribed(false);
    } else {
      const success = await subscribeToPush();
      if (success) setIsPushSubscribed(true);
    }
  };

  const saveSettings = () => {
    const settings = {
      language: selectedLanguage,
    };
    localStorage.setItem('queenchat_settings', JSON.stringify(settings));
    
    dispatch(setLanguage(selectedLanguage));
    
    setModal({
      isOpen: true,
      title: t.success,
      message: t.settingsSaved,
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
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
              <h1 className="text-xl font-semibold text-white">{t.settings}</h1>
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
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
            <h2 className="text-xl font-semibold text-white mb-6">Настройки</h2>
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <div>
                <p className="text-white font-medium">Web Push уведомления</p>
                <p className="text-purple-300 text-sm">Браузерные уведомления о новых сообщениях</p>
              </div>
              <button
                onClick={handleTogglePush}
                className={`px-4 py-2 rounded-lg transition cursor-pointer ${
                  isPushSubscribed 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50' 
                    : 'bg-purple-500 text-white hover:bg-purple-600'
                }`}
              >
                {isPushSubscribed ? '✅ Включены' : '🔔 Включить'}
              </button>
            </div>

            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <div>
                <p className="text-white font-medium">Язык</p>
                <p className="text-purple-300 text-sm">Выберите язык интерфейса</p>
              </div>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveSettings}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 transition cursor-pointer"
              >
                Сохранить настройки
              </button>
            </div>
          </div>
        </div>
      </div>

      {modal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gradient-to-br from-slate-800 to-purple-900 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-3xl">✓</span>
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