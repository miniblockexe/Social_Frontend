import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse, PagedResult } from '../models/api.models';
import { Post, Comment, PostPrivacy } from '../models/post.models';

@Injectable({ providedIn: 'root' })
export class PostService {
  private readonly http = inject(HttpClient);

  getFeed(
    page = 1,
    size = 10,
    cursorId?: string,
  ): Observable<ApiResponse<PagedResult<Post>>> {
    const params: Record<string, string | number> = { page, size };
    if (cursorId) params['cursorId'] = cursorId;
    return this.http.get<ApiResponse<PagedResult<Post>>>(
      `${API_BASE}/posts/feed`,
      { params },
    );
  }

  getPost(id: string): Observable<ApiResponse<Post>> {
    return this.http.get<ApiResponse<Post>>(`${API_BASE}/posts/${id}`);
  }

  getUserPosts(
    userId: string,
    page = 1,
    size = 10,
  ): Observable<ApiResponse<PagedResult<Post>>> {
    return this.http.get<ApiResponse<PagedResult<Post>>>(
      `${API_BASE}/users/${userId}/posts`,
      { params: { page, size } },
    );
  }

  createPost(
    content: string,
    privacy: PostPrivacy,
    files?: File[],
  ): Observable<ApiResponse<Post>> {
    const form = new FormData();
    if (content.trim()) {
      form.append('content', content);
    }
    form.append('privacy', privacy.toString());
    if (files?.length) {
      files.forEach((f) => form.append('mediaFiles', f));
    }
    return this.http.post<ApiResponse<Post>>(`${API_BASE}/posts`, form);
  }

  updatePost(
    id: string,
    content: string,
    privacy: PostPrivacy,
  ): Observable<ApiResponse<Post>> {
    return this.http.put<ApiResponse<Post>>(`${API_BASE}/posts/${id}`, {
      content,
      privacy,
    });
  }

  deletePost(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${API_BASE}/posts/${id}`);
  }

  toggleLike(postId: string): Observable<ApiResponse<{ isLiked: boolean }>> {
    return this.http.post<ApiResponse<{ isLiked: boolean }>>(
      `${API_BASE}/posts/${postId}/like`,
      {},
    );
  }

  getComments(
    postId: string,
    page = 1,
    size = 10,
  ): Observable<ApiResponse<PagedResult<Comment>>> {
    return this.http.get<ApiResponse<PagedResult<Comment>>>(
      `${API_BASE}/posts/${postId}/comments`,
      { params: { page, size } },
    );
  }

  addComment(
    postId: string,
    content: string,
    parentCommentId?: string,
  ): Observable<ApiResponse<Comment>> {
    return this.http.post<ApiResponse<Comment>>(
      `${API_BASE}/posts/${postId}/comments`,
      { content, parentCommentId },
    );
  }

  deleteComment(id: string): Observable<ApiResponse<void>> {
    return this.http.delete<ApiResponse<void>>(`${API_BASE}/comments/${id}`);
  }

  // truyền baseUrl để BE tạo deeplink đúng (không fallback về socialapp.example.com)
  // kiểu return khớp BE ShareUrlDto { postId, longUrl, shortUrl }
  getShareUrl(
    postId: string,
    baseUrl = window.location.origin,
  ): Observable<
    ApiResponse<{ postId: string; longUrl: string; shortUrl: string }>
  > {
    return this.http.get<
      ApiResponse<{ postId: string; longUrl: string; shortUrl: string }>
    >(`${API_BASE}/posts/${postId}/share`, { params: { baseUrl } });
  }

  /**
   * Chia sẻ lại bài viết lên trang cá nhân (repost).
   * POST /api/posts/{originalPostId}/share-to-feed
   */
  sharePostToFeed(
    originalPostId: string,
    content: string | null,
    privacy: PostPrivacy,
  ): Observable<ApiResponse<Post>> {
    return this.http.post<ApiResponse<Post>>(
      `${API_BASE}/posts/${originalPostId}/share-to-feed`,
      { content: content?.trim() || null, privacy },
    );
  }
}
