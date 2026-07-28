export interface UserBrief {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserBrief;
}

export enum UserRole {
  User = 0,
  Admin = 1,
}
