export interface ChatParticipant {
  user_id: string;
  username: string;
  email: string;
  avatar?: string;
  joined_at: number;
}

export interface Chat {
  id: string;
  name: string | null;
  is_group: boolean;
  participants: ChatParticipant[];
  created_by: string;
  created_at: number;
  updated_at: number;
}

export interface ChatInfo {
  id: string;
  name?: string;
  is_group: boolean;
  created_by: string;
  participants?: { 
    user_id: string; 
    username: string;
    avatar?: string;
  }[];
}