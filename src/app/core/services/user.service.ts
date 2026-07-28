import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse, PagedResult } from '../models/api.models';
import { UserProfile, UserSearchResult } from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);

  getMyProfile(): Observable<ApiResponse<UserProfile>> {
    return this.http.get<ApiResponse<UserProfile>>(`${API_BASE}/users/me`);
  }

  getProfile(id: string): Observable<ApiResponse<UserProfile>> {
    return this.http.get<ApiResponse<UserProfile>>(`${API_BASE}/users/${id}`);
  }

  updateProfile(dto: {
    fullName?: string;
    bio?: string;
  }): Observable<ApiResponse<UserProfile>> {
    return this.http.put<ApiResponse<UserProfile>>(`${API_BASE}/users/me`, dto);
  }

  // BE trả ApiResponse<string> — data là URL string trực tiếp, không phải object
  updateAvatar(file: File): Observable<ApiResponse<string>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<ApiResponse<string>>(
      `${API_BASE}/users/me/avatar`,
      form,
    );
  }

  // BE trả ApiResponse<string> — data là URL string trực tiếp, không phải object
  updateCover(file: File): Observable<ApiResponse<string>> {
    const form = new FormData();
    form.append('file', file);
    return this.http.put<ApiResponse<string>>(
      `${API_BASE}/users/me/cover`,
      form,
    );
  }

  // BE trả UserSearchResultDto (khác UserProfile — không có bio, coverPhotoUrl,...)
  searchUsers(
    keyword: string,
    page = 1,
    size = 10,
  ): Observable<ApiResponse<PagedResult<UserSearchResult>>> {
    return this.http.get<ApiResponse<PagedResult<UserSearchResult>>>(
      `${API_BASE}/users/search`,
      { params: { q: keyword, page, size } },
    );
  }
}
