export interface MessageReaction {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
}

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string;
  created_at: number;
  edited_at?: number | null;
  deleted_at?: number | null;
  is_read: boolean;
  is_sticker?: boolean;
  is_image?: boolean;
  images?: string[] | string | null;
  media?: { type: 'voice' | 'video_note'; url: string; duration: number; waveform?: number[]; thumbnail_url?: string; width?: number; height?: number; file_size?: number; mime_type?: string } | null;
  reply_to_id?: string;
  reply_to_message?: Message;
  forwarded_from_message_id?: string | null;
  forwarded_from_user_id?: string | null;
  forwarded_from_user_name?: string | null;
  reactions?: MessageReaction[];
  comments_count?: number;
}

export interface LastMessage {
  id: string;
  content: string;
  created_at: number;
  sender_id: string;
  sender_name?: string;
  is_image?: boolean;
  images?: string[] | string | null;
  is_sticker?: boolean;
  media?: Message['media'];
  edited_at?: number | null;
  deleted_at?: number | null;
}
