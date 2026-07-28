import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse, PagedResult } from '../models/api.models';
import {
  FriendRequest,
  FriendListItem,
  FriendSuggestion,
} from '../models/friend.models';

// BE /friends/status/{id} trả string do C# enum.ToString():
// FriendStatus.Pending → "Pending", FriendStatus.Accepted → "Accepted", ...
// Trường hợp không có record → "None" (custom 99), xem chính mình → "Self"
export type FriendshipStatusRaw =
  | 'None'
  | 'Self'
  | 'Pending'
  | 'Accepted'
  | 'Rejected'
  | 'Blocked';

@Injectable({ providedIn: 'root' })
export class FriendService {
  private readonly http = inject(HttpClient);

  sendRequest(receiverId: string): Observable<ApiResponse<FriendRequest>> {
    return this.http.post<ApiResponse<FriendRequest>>(
      `${API_BASE}/friends/request`,
      { receiverId },
    );
  }

  acceptRequest(requestId: string): Observable<ApiResponse<FriendRequest>> {
    return this.http.put<ApiResponse<FriendRequest>>(
      `${API_BASE}/friends/request/${requestId}/accept`,
      {},
    );
  }

  rejectRequest(requestId: string): Observable<ApiResponse<FriendRequest>> {
    return this.http.put<ApiResponse<FriendRequest>>(
      `${API_BASE}/friends/request/${requestId}/reject`,
      {},
    );
  }

  unfriend(targetId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      `${API_BASE}/friends/${targetId}`,
    );
  }

  blockUser(targetId: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(
      `${API_BASE}/friends/block/${targetId}`,
      {},
    );
  }

  unblockUser(targetId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(
      `${API_BASE}/friends/block/${targetId}`,
    );
  }

  getFriends(
    page = 1,
    size = 20,
  ): Observable<ApiResponse<PagedResult<FriendListItem>>> {
    return this.http.get<ApiResponse<PagedResult<FriendListItem>>>(
      `${API_BASE}/friends`,
      { params: { page, size } },
    );
  }

  getPendingRequests(
    page = 1,
    size = 20,
  ): Observable<ApiResponse<PagedResult<FriendRequest>>> {
    return this.http.get<ApiResponse<PagedResult<FriendRequest>>>(
      `${API_BASE}/friends/requests/pending`,
      { params: { page, size } },
    );
  }

  getSentRequests(
    page = 1,
    size = 20,
  ): Observable<ApiResponse<PagedResult<FriendRequest>>> {
    return this.http.get<ApiResponse<PagedResult<FriendRequest>>>(
      `${API_BASE}/friends/requests/sent`,
      { params: { page, size } },
    );
  }

  getSuggestions(
    page = 1,
    size = 10,
  ): Observable<ApiResponse<PagedResult<FriendSuggestion>>> {
    return this.http.get<ApiResponse<PagedResult<FriendSuggestion>>>(
      `${API_BASE}/friends/suggestions`,
      { params: { page, size } },
    );
  }

  // BE trả { status: string } — xem FriendshipStatusRaw
  getFriendshipStatus(
    targetId: string,
  ): Observable<ApiResponse<{ status: FriendshipStatusRaw }>> {
    return this.http.get<ApiResponse<{ status: FriendshipStatusRaw }>>(
      `${API_BASE}/friends/status/${targetId}`,
    );
  }
}
