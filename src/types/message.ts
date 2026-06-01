export interface Message {
  id: string;
  content: string;
  sender_id: string;
  chat_id: string;
  created_at: number;
}