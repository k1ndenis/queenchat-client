export interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string;
  created_at: number;
  is_read: boolean;
  is_sticker?: boolean;
  is_image?: boolean;
  reply_to_id?: string;
  reply_to_message?: Message;
}

export interface LastMessage {
  id: string;
  content: string;
  created_at: number;
  sender_id: string;
  sender_name?: string;
}