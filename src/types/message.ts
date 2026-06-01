export interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string;
  created_at: number;
  is_read: boolean;
  is_sticker?: boolean;
  sticker_id?: string | null;
}