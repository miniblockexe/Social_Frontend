import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse, PagedResult } from '../models/api.models';
import { Notification } from '../models/notification.models';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);

  getNotifications(
    page = 1,
    size = 20,
  ): Observable<ApiResponse<PagedResult<Notification>>> {
    return this.http.get<ApiResponse<PagedResult<Notification>>>(
      `${API_BASE}/notifications`,
      { params: { page, size } },
    );
  }

  getUnreadCount(): Observable<
    ApiResponse<{ unreadCount: number; totalCount: number }>
  > {
    return this.http.get<
      ApiResponse<{ unreadCount: number; totalCount: number }>
    >(`${API_BASE}/notifications/count`);
  }

  markAsRead(ids: string[]): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(`${API_BASE}/notifications/read`, {
      notificationIds: ids,
    });
  }

  markAllAsRead(): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${API_BASE}/notifications/read-all`,
      {},
    );
  }

  deleteNotification(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      `${API_BASE}/notifications/${id}`,
    );
  }
}
