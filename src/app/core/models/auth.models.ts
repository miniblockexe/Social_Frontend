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

/** Thông tin bảo mật của chính user đang đăng nhập (GET /auth/security-info). */
export interface AccountSecurity {
  email: string;
  /** False với tài khoản Google chưa từng đặt mật khẩu. */
  hasPassword: boolean;
}
