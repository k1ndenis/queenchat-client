import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../lib/redux/hooks';
import { logout, setLanguage } from '../lib/redux/slices/userSlice';
import LoadingScreen from './LoadingScreen';
import { translations } from '../lib/locales';
import { getNotificationPreferences, saveNotificationPreferences, requestFCMToken, removeFCMToken } from '../lib/firebase';
import { clearUserCache } from '../lib/cache';

const notificationCopy = {
  ru: {
    notifications: 'Уведомления',
    all: 'Все уведомления',
    direct: 'Личные сообщения',
    messages: 'Сообщения',
    groups: 'Группы',
    channels: 'Каналы',
    calls: 'Звонки',
    reactions: 'Реакции на мои сообщения',
    sound: 'Звук',
    vibration: 'Вибрация',
    preview: 'Предпросмотр текста',
    dnd: 'Не беспокоить',
    temporaryMute: 'Временно отключить',
    off: 'Выключено',
    oneHour: '1 час',
    eightHours: '8 часов',
    oneDay: '1 день',
  },
  en: {
    notifications: 'Notifications',
    all: 'All notifications',
    direct: 'Direct messages',
    messages: 'Messages',
    groups: 'Groups',
    channels: 'Channels',
    calls: 'Calls',
    reactions: 'Reactions to my messages',
    sound: 'Sound',
    vibration: 'Vibration',
    preview: 'Text preview',
    dnd: 'Do not disturb',
    temporaryMute: 'Temporary mute',
    off: 'Off',
    oneHour: '1 hour',
    eightHours: '8 hours',
    oneDay: '1 day',
  },
};

export default function Settings() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { user, language: reduxLanguage } = useAppSelector(state => state.user);
  const [loading, setLoading] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState(reduxLanguage);
  const [notificationPreferences, setNotificationPreferences] = useState(getNotificationPreferences());
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
    setNotificationPreferences(getNotificationPreferences());
    
    setLoading(false);
  }, [user, navigate]);

  const saveSettings = () => {
    const savedNotificationPreferences = saveNotificationPreferences(notificationPreferences);
    const settings = {
      language: selectedLanguage,
      notifications: savedNotificationPreferences,
    };
    localStorage.setItem('queenchat_settings', JSON.stringify(settings));
    
    dispatch(setLanguage(selectedLanguage));
    
    setModal({
      isOpen: true,
      title: t.success,
      message: t.settingsSaved,
    });
    requestFCMToken().catch(() => {});
  };

  const updateNotificationPreference = <K extends keyof typeof notificationPreferences>(
    key: K,
    value: typeof notificationPreferences[K],
  ) => {
    setNotificationPreferences(prev => ({ ...prev, [key]: value }));
  };

  const until = (hours: number | null) => hours ? Date.now() + hours * 60 * 60 * 1000 : null;
  const n = notificationCopy[selectedLanguage as keyof typeof notificationCopy] || notificationCopy.ru;

  const handleLogout = async () => {
    await removeFCMToken();
    if (user) await clearUserCache(user.id);
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
            <h2 className="text-xl font-semibold text-white mb-6">{t.settings}</h2>

            {/* Language Settings */}
            <div className="flex justify-between items-center py-3 border-b border-white/10">
              <div>
                <p className="text-white font-medium">{t.language}</p>
                <p className="text-purple-300 text-sm">{t.languageDesc}</p>
              </div>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="px-3 py-1 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ru">{t.languageRu}</option>
                <option value="en">{t.languageEn}</option>
              </select>
            </div>

            <div className="py-5 border-b border-white/10">
              <h3 className="text-white font-semibold mb-4">{n.notifications}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['enabled', n.all],
                  ['messages', n.messages],
                  ['directMessages', n.direct],
                  ['groups', n.groups],
                  ['channels', n.channels],
                  ['calls', n.calls],
                  ['reactions', n.reactions],
                  ['sound', n.sound],
                  ['vibration', n.vibration],
                  ['previewText', n.preview],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-purple-100">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      checked={Boolean(notificationPreferences[key as keyof typeof notificationPreferences])}
                      onChange={(event) => updateNotificationPreference(
                        key as keyof typeof notificationPreferences,
                        event.target.checked as never,
                      )}
                      className="h-4 w-4 accent-purple-500"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <label className="text-sm text-purple-100">
                  <span className="block mb-2">{n.dnd}</span>
                  <select
                    value={notificationPreferences.doNotDisturbUntil ? '8' : ''}
                    onChange={(event) => updateNotificationPreference('doNotDisturbUntil', until(event.target.value ? Number(event.target.value) : null))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">{n.off}</option>
                    <option value="1">{n.oneHour}</option>
                    <option value="8">{n.eightHours}</option>
                    <option value="24">{n.oneDay}</option>
                  </select>
                </label>

                <label className="text-sm text-purple-100">
                  <span className="block mb-2">{n.temporaryMute}</span>
                  <select
                    value={notificationPreferences.mutedUntil ? '1' : ''}
                    onChange={(event) => updateNotificationPreference('mutedUntil', until(event.target.value ? Number(event.target.value) : null))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  >
                    <option value="">{n.off}</option>
                    <option value="1">{n.oneHour}</option>
                    <option value="8">{n.eightHours}</option>
                    <option value="24">{n.oneDay}</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveSettings}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:opacity-90 transition cursor-pointer"
              >
                {t.saveSettings}
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
