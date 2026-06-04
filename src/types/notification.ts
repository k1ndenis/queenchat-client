export interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  chat_id: string;
  is_read: boolean;
  created_at: number;
}