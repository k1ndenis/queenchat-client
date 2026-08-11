export interface ChatParticipant {
  user_id: string;
  username: string;
  display_name?: string | null;
  email: string;
  avatar?: string;
  joined_at: number;
}

export interface Chat {
  id: string;
  name: string | null;
  avatar?: string | null;
  chat_type: 'private' | 'group' | 'channel';
  participants: ChatParticipant[];
  created_by: string;
  created_at: number;
  updated_at: number;
  unread_count?: number;
  has_unread_reactions?: boolean;
  unread_reactions_count?: number;
}

export interface ChatInfo {
  id: string;
  name?: string;
  avatar?: string;
  chat_type: 'private' | 'group' | 'channel';
  created_by: string;
  participants?: { 
    user_id: string; 
    username: string;
    display_name?: string | null;
    avatar?: string;
  }[];
}
