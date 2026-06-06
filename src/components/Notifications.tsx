import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../lib/redux/hooks';
import { fetchWithAuth } from '../../lib/api';
import { socket } from '../../lib/socket';
import { translations } from '../../lib/locales';
import type { Notification } from '../types/notification';
import { createPortal } from 'react-dom';

export default function Notifications() {
  const navigate = useNavigate();
  const language = useAppSelector(state => state.user.language);
  const t = translations[language as keyof typeof translations];
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const apiUrl = import.meta.env.VITE_API_URL;

  const loadNotifications = async () => {
    try {
      const response = await fetchWithAuth(`${apiUrl}/notifications/`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setNotifications(data);
        const unread = data.filter((n: Notification) => !n.is_read).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('Error loading notifications:', error);
      setNotifications([]);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const response = await fetchWithAuth(`${apiUrl}/notifications/unread/count`);
      const data = await response.json();
      setUnreadCount(data.count || 0);
    } catch (error) {
      console.error('Error loading unread count:', error);
      setUnreadCount(0);
    }
  };

  const handleNotification = (data: any) => {
    const notificationData = data.data || data;
    
    const newNotification: Notification = {
      id: notificationData.id || Date.now().toString(),
      title: notificationData.title || t.newMessage || 'Новое уведомление',
      message: notificationData.message || '',
      type: notificationData.type || 'info',
      chat_id: notificationData.chat_id || '',
      is_read: false,
      created_at: notificationData.created_at || Math.floor(Date.now() / 1000)
    };
    
    setNotifications(prev => [newNotification, ...prev.slice(0, 99)]);
    setUnreadCount(prev => prev + 1);
  };

  useEffect(() => {
    loadNotifications();
    loadUnreadCount();
    socket.on('notification', handleNotification);
    return () => {
      socket.off('notification', handleNotification);
    };
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await fetchWithAuth(`${apiUrl}/notifications/${id}/read`, {
        method: 'PATCH',
      });
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetchWithAuth(`${apiUrl}/notifications/read/all`, {
        method: 'PATCH',
      });
      
      const chatsResponse = await fetchWithAuth(`${apiUrl}/chats/`);
      const chats = await chatsResponse.json();
      
      if (Array.isArray(chats) && chats.length > 0) {
        await Promise.all(
          chats.map(chat =>
            fetchWithAuth(`${apiUrl}/chats/${chat.id}/messages/read/all`, {
              method: 'POST',
            }).catch(err => console.error(`Error marking chat ${chat.id}:`, err))
          )
        );
      }
      
      setNotifications(prev =>
        prev.map(n => ({ ...n, is_read: true }))
      );
      setUnreadCount(0);
      
      window.dispatchEvent(new CustomEvent('refreshChatList'));
      
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    setIsOpen(false);
    if (notification.chat_id) {
      navigate(`/chat/${notification.chat_id}`);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-white hover:text-purple-300 transition cursor-pointer"
        title={t.notifications || 'Уведомления'}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="22" 
          height="22" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        createPortal(
         <>
          <div 
            className="fixed inset-0 z-[99999] bg-black/50"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed top-0 right-0 bottom-0 w-96 z-[100000] 
            bg-slate-800 shadow-2xl border-l border-white/20
            flex flex-col animate-slide-in">
            <div className="p-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-white font-semibold text-lg">{t.notifications || 'Уведомления'}</h3>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs text-purple-400 hover:text-purple-300 transition px-2 py-1 rounded cursor-pointer"
                  >
                    {t.markAllRead || 'Прочитать всё'}
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-white/60 hover:text-white transition p-1 rounded hover:bg-white/10"
                  title={t.close || 'Закрыть'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-purple-300 text-center py-8">{t.noNotifications || 'Нет уведомлений'}</p>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`p-4 border-b border-white/10 cursor-pointer hover:bg-white/5 transition ${
                      !n.is_read ? 'bg-purple-500/10 border-l-4 border-l-purple-500' : ''
                    }`}
                    onClick={() => handleNotificationClick(n)}
                  >
                    <p className="text-white text-sm font-medium">{n.title}</p>
                    <p className="text-purple-300 text-xs mt-1">{n.message}</p>
                    <p className="text-purple-400/50 text-xs mt-2">
                      {new Date(n.created_at * 1000).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
        )
      )}
    </>
  );
}