export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  created_at?: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  created_at: number;
}