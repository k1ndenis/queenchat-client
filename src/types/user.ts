export interface User {
  id: string;
  username: string;
  display_name?: string;
  phone: string;
  email?: string;
  avatar?: string;
  created_at?: number;
  role?: 'user' | 'admin';
  is_blocked?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  display_name?: string;
  phone: string;
  email?: string;
  avatar?: string;
  created_at: number;
}

export interface PublicUserProfile {
  id: string;
  username: string;
  display_name?: string;
  avatar?: string;
  created_at: number;
}
