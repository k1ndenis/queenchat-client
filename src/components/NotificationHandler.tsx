import { useEffect, useRef } from 'react';
import { useAppSelector } from '../lib/redux/hooks';
import { socket } from '../lib/socket';

export default function NotificationHandler() {
  const { user } = useAppSelector(state => state.user);
  const shownNotifications = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;

    const handlePushNotification = (data: any) => {
      console.log('📢 Push notification received:', data);
      
      const notificationData = data.data || data;
      const key = `${notificationData.chat_id}_${notificationData.title}`;
      
      if (shownNotifications.current.has(key)) return;
      shownNotifications.current.add(key);
      
      if (Notification.permission === 'granted') {
        new Notification(notificationData.title || 'Новое сообщение', {
          body: notificationData.message || '',
          icon: '/logo.png',
          tag: notificationData.chat_id,
        });
      }
      
      setTimeout(() => {
        shownNotifications.current.delete(key);
      }, 3000);
    };

    socket.on('push_notification', handlePushNotification);

    return () => {
      socket.off('push_notification', handlePushNotification);
    };
  }, [user]);

  return null;
}