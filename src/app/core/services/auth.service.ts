import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_BASE, TOKEN_KEY, REFRESH_KEY } from '../constants/api.constants';
import { ApiResponse } from '../models/api.models';
import { AuthResponse, UserBrief, UserRole } from '../models/auth.models';
import { ChatHubService } from './chat-hub.service';

const USER_KEY = 'current_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly chatHubService = inject(ChatHubService);

  currentUser = signal<UserBrief | null>(this.readUserFromStorage());

  isLoggedIn = computed(() => this.currentUser() !== null);
  isAdmin = computed(() => {
    const role = this.currentUser()?.role;
    return (
      role === UserRole.Admin ||
      (role as unknown as string) === 'Admin' ||
      (role as unknown as string) === 'admin'
    );
  });

  private readUserFromStorage(): UserBrief | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as UserBrief) : null;
    } catch {
      return null;
    }
  }

  private writeUserToStorage(user: UserBrief | null): void {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }

  register(dto: {
    fullName: string;
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
  }): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(
      `${API_BASE}/auth/register`,
      dto,
    );
  }

  login(
    email: string,
    password: string,
  ): Observable<ApiResponse<AuthResponse>> {
    return this.http
      .post<
        ApiResponse<AuthResponse>
      >(`${API_BASE}/auth/login`, { email, password })
      .pipe(
        tap(async (res) => {
          if (res.success) {
            await this.chatHubService.resetForNewUser();

            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
            this.currentUser.set(res.data.user);
            this.writeUserToStorage(res.data.user);
          }
        }),
      );
  }

  googleLogin(idToken: string): Observable<ApiResponse<AuthResponse>> {
    return this.http
      .post<
        ApiResponse<AuthResponse>
      >(`${API_BASE}/auth/google-login`, { idToken })
      .pipe(
        tap(async (res) => {
          if (res.success) {
            await this.chatHubService.resetForNewUser(); 

            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
            this.currentUser.set(res.data.user);
            this.writeUserToStorage(res.data.user);
          }
        }),
      );
  }

  logout(): void {
    const refreshToken = localStorage.getItem(REFRESH_KEY);

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem('current_user');
    this.currentUser.set(null);

    if (refreshToken) {
      this.http
        .post<ApiResponse<void>>(`${API_BASE}/auth/revoke`, { refreshToken })
        .subscribe({ error: () => {} });
    }

    window.location.href = '/auth/login';
  }

  refreshToken(): Observable<ApiResponse<AuthResponse>> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    return this.http
      .post<
        ApiResponse<AuthResponse>
      >(`${API_BASE}/auth/refresh`, { refreshToken })
      .pipe(
        tap((res) => {
          if (res.success) {
            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
          }
        }),
      );
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/forgot-password`, { email });
  }

  verifyOtp(
    email: string,
    token: string,
  ): Observable<ApiResponse<{ verifyToken: string }>> {
    return this.http.post<ApiResponse<{ verifyToken: string }>>(
      `${API_BASE}/auth/verify-otp`,
      { email, token },
    );
  }

  resetPassword(dto: {
    email: string;
    verifyToken: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/reset-password`, dto);
  }

  changePassword(dto: {
    oldPassword: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${API_BASE}/auth/change-password`,
      dto,
    );
  }

  async loadCurrentUser(): Promise<void> {
    return new Promise((resolve) => {
      this.http.get<ApiResponse<UserBrief>>(`${API_BASE}/users/me`).subscribe({
        next: (res) => {
          if (res.success) {
            const storedRole = this.readUserFromStorage()?.role;
            const user: UserBrief = {
              ...res.data,
              role:
                res.data.role !== undefined && res.data.role !== null
                  ? res.data.role
                  : (storedRole ?? UserRole.User),
            };
            this.currentUser.set(user);
            this.writeUserToStorage(user);
          }
          resolve();
        },
        error: () => resolve(),
      });
    });
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  isTokenExpired(): boolean {
    const token = this.getToken();
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.exp < Date.now() / 1000;
    } catch {
      return true;
    }
  }
}
