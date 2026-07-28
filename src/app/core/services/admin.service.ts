import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse, PagedResult } from '../models/api.models';
import {
  AdminDashboard,
  AdminUser,
  AdminPost,
  AdminCloudStats,
} from '../models/admin.models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  getDashboard(): Observable<ApiResponse<AdminDashboard>> {
    return this.http.get<ApiResponse<AdminDashboard>>(
      `${API_BASE}/admin/dashboard`,
    );
  }

  getPosts(params: {
    page?: number;
    size?: number;
    isDeleted?: boolean;
    userId?: string;
    keyword?: string;
    fromDate?: string;
    toDate?: string;
    sortBy?: string;
    sortDesc?: boolean;
  }): Observable<ApiResponse<PagedResult<AdminPost>>> {
    return this.http.get<ApiResponse<PagedResult<AdminPost>>>(
      `${API_BASE}/admin/posts`,
      { params: this.buildQueryParams(params) },
    );
  }

  deletePost(id: string, reason: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      `${API_BASE}/admin/posts/${id}`,
      { body: { reason } },
    );
  }

  restorePost(id: string): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${API_BASE}/admin/posts/${id}/restore`,
      {},
    );
  }

  getUsers(params: {
    page?: number;
    size?: number;
    isBanned?: boolean;
    role?: number;
    keyword?: string;
    sortBy?: string;
    sortDesc?: boolean;
  }): Observable<ApiResponse<PagedResult<AdminUser>>> {
    return this.http.get<ApiResponse<PagedResult<AdminUser>>>(
      `${API_BASE}/admin/users`,
      { params: this.buildQueryParams(params) },
    );
  }

  banUser(userId: string, reason: string): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${API_BASE}/admin/users/${userId}/ban`,
      { reason },
    );
  }

  unbanUser(userId: string): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${API_BASE}/admin/users/${userId}/unban`,
      {},
    );
  }

  getCloudStats(): Observable<ApiResponse<AdminCloudStats>> {
    return this.http.get<ApiResponse<AdminCloudStats>>(
      `${API_BASE}/admin/cloud/stats`,
    );
  }

  deleteCloudFile(
    publicIdOrKey: string,
    provider: number,
    mediaType: number,
    postMediaFileId?: string,
  ): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${API_BASE}/admin/cloud/file`, {
      body: { publicIdOrKey, provider, mediaType, postMediaFileId },
    });
  }

  private buildQueryParams(params: Record<string, any>): HttpParams {
    let httpParams = new HttpParams();
    for (const key of Object.keys(params)) {
      const value = params[key];
      if (value !== undefined && value !== null) {
        httpParams = httpParams.set(key, String(value));
      }
    }
    return httpParams;
  }
}
