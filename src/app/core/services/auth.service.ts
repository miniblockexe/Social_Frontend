import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { API_BASE, TOKEN_KEY, REFRESH_KEY } from '../constants/api.constants';
import { ApiResponse } from '../models/api.models';
import { AuthResponse, UserBrief, UserRole } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  currentUser = signal<UserBrief | null>(null);
  isLoggedIn = computed(() => this.currentUser() !== null);
  isAdmin = computed(() => this.currentUser()?.role === UserRole.Admin);

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
      .post<ApiResponse<AuthResponse>>(`${API_BASE}/auth/login`, {
        email,
        password,
      })
      .pipe(
        tap((res) => {
          if (res.success) {
            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
            this.currentUser.set(res.data.user);
          }
        }),
      );
  }

  // gửi refreshToken trong body thay vì body rỗng {}
  // BE RevokeTokenRequestDto yêu cầu { RefreshToken: string }
  logout(): void {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    this.http
      .post<ApiResponse<void>>(`${API_BASE}/auth/revoke`, { refreshToken })
      .subscribe({ error: () => {} });
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    this.currentUser.set(null);
    this.router.navigate(['/auth/login']);
  }

  refreshToken(): Observable<ApiResponse<AuthResponse>> {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    return this.http
      .post<ApiResponse<AuthResponse>>(`${API_BASE}/auth/refresh`, {
        refreshToken,
      })
      .pipe(
        tap((res) => {
          if (res.success) {
            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
          }
        }),
      );
  }

  // đổi currentPassword → oldPassword để khớp BE ChangePasswordDto
  // BE nhận: { OldPassword, NewPassword, ConfirmNewPassword }
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
          if (res.success) this.currentUser.set(res.data);
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
  googleLogin(idToken: string): Observable<ApiResponse<AuthResponse>> {
    return this.http
      .post<
        ApiResponse<AuthResponse>
      >(`${API_BASE}/auth/google-login`, { idToken })
      .pipe(
        tap((res) => {
          if (res.success) {
            localStorage.setItem(TOKEN_KEY, res.data.accessToken);
            localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
            this.currentUser.set(res.data.user);
          }
        }),
      );
  }

  forgotPassword(email: string): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/forgot-password`, { email });
  }

  resetPassword(dto: {
    email: string;
    token: string;
    newPassword: string;
    confirmNewPassword: string;
  }): Observable<void> {
    return this.http.post<void>(`${API_BASE}/auth/reset-password`, dto);
  }
}
