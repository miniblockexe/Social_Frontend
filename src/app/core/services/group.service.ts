import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse, PagedResult } from '../models/api.models';
import { Post } from '../models/post.models';
import {
  GroupDetail,
  GroupSummary,
  GroupMember,
  GroupJoinRequest,
  CreateGroupRequest,
  UpdateGroupRequest,
  ApproveJoinRequestDto,
  UpdateMemberRoleDto,
  ReviewGroupPostDto,
  GroupRole,
} from '../models/group.models';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private readonly http = inject(HttpClient);

  // ── CRUD ───────────────────────────────────────────────────────────────

  createGroup(dto: CreateGroupRequest): Observable<ApiResponse<GroupDetail>> {
    const form = new FormData();
    form.append('name', dto.name);
    if (dto.description) form.append('description', dto.description);
    form.append('privacy', dto.privacy.toString());
    form.append('requireApproval', dto.requireApproval.toString());
    form.append('requirePostApproval', dto.requirePostApproval.toString());
    if (dto.avatar) form.append('avatar', dto.avatar);
    return this.http.post<ApiResponse<GroupDetail>>(`${API_BASE}/groups`, form);
  }

  getGroup(id: string): Observable<ApiResponse<GroupDetail>> {
    return this.http.get<ApiResponse<GroupDetail>>(`${API_BASE}/groups/${id}`);
  }

  searchGroups(keyword?: string, page = 1, size = 20): Observable<ApiResponse<PagedResult<GroupSummary>>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (keyword) params = params.set('keyword', keyword);
    return this.http.get<ApiResponse<PagedResult<GroupSummary>>>(`${API_BASE}/groups/search`, { params });
  }

  getMyGroups(page = 1, size = 20): Observable<ApiResponse<PagedResult<GroupSummary>>> {
    return this.http.get<ApiResponse<PagedResult<GroupSummary>>>(
      `${API_BASE}/groups/mine`, { params: { page, size } });
  }

  updateGroup(id: string, dto: UpdateGroupRequest): Observable<ApiResponse<GroupDetail>> {
    const form = new FormData();
    if (dto.name) form.append('name', dto.name);
    if (dto.description !== undefined) form.append('description', dto.description ?? '');
    if (dto.privacy !== undefined) form.append('privacy', dto.privacy.toString());
    if (dto.requireApproval !== undefined) form.append('requireApproval', dto.requireApproval.toString());
    if (dto.requirePostApproval !== undefined) form.append('requirePostApproval', dto.requirePostApproval.toString());
    if (dto.avatar) form.append('avatar', dto.avatar);
    if (dto.cover) form.append('cover', dto.cover);
    return this.http.put<ApiResponse<GroupDetail>>(`${API_BASE}/groups/${id}`, form);
  }

  deleteGroup(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${API_BASE}/groups/${id}`);
  }

  // ── Member ─────────────────────────────────────────────────────────────

  joinGroup(id: string): Observable<ApiResponse<object>> {
    return this.http.post<ApiResponse<object>>(`${API_BASE}/groups/${id}/join`, {});
  }

  leaveGroup(id: string): Observable<ApiResponse<void>> {
    return this.http.post<ApiResponse<void>>(`${API_BASE}/groups/${id}/leave`, {});
  }

  cancelJoinRequest(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${API_BASE}/groups/${id}/join-request`);
  }

  getMembers(groupId: string, page = 1, size = 20): Observable<ApiResponse<PagedResult<GroupMember>>> {
    return this.http.get<ApiResponse<PagedResult<GroupMember>>>(
      `${API_BASE}/groups/${groupId}/members`, { params: { page, size } });
  }

  kickMember(groupId: string, userId: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${API_BASE}/groups/${groupId}/members/${userId}`);
  }

  updateMemberRole(groupId: string, userId: string, dto: UpdateMemberRoleDto): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(`${API_BASE}/groups/${groupId}/members/${userId}/role`, dto);
  }

  // ── Join Requests ───────────────────────────────────────────────────────

  getPendingJoinRequests(groupId: string, page = 1, size = 20): Observable<ApiResponse<PagedResult<GroupJoinRequest>>> {
    return this.http.get<ApiResponse<PagedResult<GroupJoinRequest>>>(
      `${API_BASE}/groups/${groupId}/join-requests`, { params: { page, size } });
  }

  reviewJoinRequest(groupId: string, requestId: string, dto: ApproveJoinRequestDto): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${API_BASE}/groups/${groupId}/join-requests/${requestId}`, dto);
  }

  // ── Group Posts ─────────────────────────────────────────────────────────

  getGroupFeed(groupId: string, page = 1, size = 10, cursorId?: string): Observable<ApiResponse<PagedResult<Post>>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (cursorId) params = params.set('cursorId', cursorId);
    return this.http.get<ApiResponse<PagedResult<Post>>>(`${API_BASE}/groups/${groupId}/posts`, { params });
  }

  createGroupPost(groupId: string, content: string, files?: File[]): Observable<ApiResponse<Post>> {
    const form = new FormData();
    if (content.trim()) form.append('content', content);
    form.append('privacy', '0');
    files?.forEach(f => form.append('mediaFiles', f));
    return this.http.post<ApiResponse<Post>>(`${API_BASE}/groups/${groupId}/posts`, form);
  }

  getPendingPosts(groupId: string, page = 1, size = 20): Observable<ApiResponse<PagedResult<Post>>> {
    return this.http.get<ApiResponse<PagedResult<Post>>>(
      `${API_BASE}/groups/${groupId}/posts/pending`, { params: { page, size } });
  }

  reviewGroupPost(groupId: string, postId: string, dto: ReviewGroupPostDto): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(`${API_BASE}/groups/${groupId}/posts/${postId}/review`, dto);
  }
}
