import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../lib/redux/hooks';
import { logout } from '../lib/redux/slices/userSlice';
import { translations } from '../lib/locales';

interface UserMenuProps {
  username: string;
  email: string;
}

export default function UserMenu({ username, email }: UserMenuProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLDivElement>(null);
  const language = useAppSelector(state => state.user.language);
  const { user } = useAppSelector(state => state.user);
  const t = translations[language as keyof typeof translations];
  
  const ADMIN_ID = '82a18fba-e6b8-4eb8-a77a-2311bcd19f16';
  const isAdmin = user?.id === ADMIN_ID;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.user-menu') && !target.closest('.user-menu-panel')) {
        setIsOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    dispatch(logout());
    navigate('/login');
  };

  const menuContent = (
    <div className="bg-slate-800 rounded-xl shadow-2xl border border-white/10 overflow-hidden w-64 user-menu-panel">
      <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
          {user?.avatar ? (
            <img src={user.avatar} alt={username} className="w-full h-full object-cover" />
          ) : (
            <span className="text-white text-base font-medium">
              {username?.[0]?.toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-semibold truncate">{username}</p>
            {isAdmin && (
              <span className="text-xs bg-gradient-to-r from-yellow-500 to-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                ADMIN
              </span>
            )}
          </div>
          <p className="text-purple-300 text-xs mt-0.5 truncate">{email}</p>
        </div>
      </div>
      <div className="py-2">
        <button
          onClick={() => {
            setIsOpen(false);
            navigate('/profile');
          }}
          className="w-full px-4 py-2.5 text-left text-purple-200 hover:bg-white/10 transition flex items-center gap-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          {t.profile || 'Профиль'}
        </button>
        <button
          onClick={() => {
            setIsOpen(false);
            navigate('/settings');
          }}
          className="w-full px-4 py-2.5 text-left text-purple-200 hover:bg-white/10 transition flex items-center gap-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          {t.settings || 'Настройки'}
        </button>
      </div>
      <div className="border-t border-white/10 py-2">
        <button
          onClick={handleLogout}
          className="w-full px-4 py-2.5 text-left text-red-400 hover:bg-white/10 transition flex items-center gap-3"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          {t.logout || 'Выйти'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative user-menu" ref={buttonRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:scale-105 transition-all duration-200 flex items-center justify-center shadow-lg overflow-hidden"
      >
        {user?.avatar ? (
          <img src={user.avatar} alt={username} className="w-full h-full object-cover" />
        ) : (
          <span className="text-white text-lg font-medium">
            {username?.[0]?.toUpperCase() || 'U'}
          </span>
        )}
      </button>

      {isOpen && (
        <div 
          className="absolute right-0 top-12 bg-slate-800 rounded-xl shadow-2xl border border-white/10 overflow-hidden z-[10000] w-64"
        >
          {menuContent}
        </div>
      )}
    </div>
  );
}