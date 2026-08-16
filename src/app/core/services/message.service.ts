import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse, PagedResult } from '../models/api.models';
import { Conversation, Message } from '../models/message.models';

@Injectable({ providedIn: 'root' })
export class MessageService {
  private readonly http = inject(HttpClient);

  createOrGetConversation(
    participantIds: string[],
    isGroup = false,
    groupName?: string,
  ): Observable<ApiResponse<Conversation>> {
    return this.http.post<ApiResponse<Conversation>>(
      `${API_BASE}/conversations`,
      { participantIds, isGroup, groupName },
    );
  }

  getConversations(
    page = 1,
    size = 20,
  ): Observable<ApiResponse<PagedResult<Conversation>>> {
    return this.http.get<ApiResponse<PagedResult<Conversation>>>(
      `${API_BASE}/conversations`,
      { params: { page, size } },
    );
  }

  getMessages(
    conversationId: string,
    page = 1,
    size = 30,
  ): Observable<ApiResponse<PagedResult<Message>>> {
    return this.http.get<ApiResponse<PagedResult<Message>>>(
      `${API_BASE}/conversations/${conversationId}/messages`,
      { params: { page, size } },
    );
  }

  sendMessage(
    conversationId: string,
    content: string,
    attachment?: File,
  ): Observable<ApiResponse<Message>> {
    const form = new FormData();
    form.append('content', content);
    if (attachment) {
      form.append('attachment', attachment);
    }
    return this.http.post<ApiResponse<Message>>(
      `${API_BASE}/conversations/${conversationId}/messages`,
      form,
    );
  }

  markAsSeen(conversationId: string): Observable<ApiResponse<void>> {
    return this.http.put<ApiResponse<void>>(
      `${API_BASE}/conversations/${conversationId}/seen`,
      {},
    );
  }

  deleteMessage(messageId: string): Observable<ApiResponse<Message>> {
    return this.http.delete<ApiResponse<Message>>(
      `${API_BASE}/messages/${messageId}`,
    );
  }

  sharePostToConversation(
    postId: string,
    conversationId: string,
    caption?: string,
  ): Observable<Message> {
    const form = new FormData();
    form.append('SharedPostId', postId);
    if (caption?.trim()) form.append('Content', caption.trim());
    return this.http
      .post<
        ApiResponse<Message>
      >(`${API_BASE}/conversations/${conversationId}/messages`, form)
      .pipe(map((r) => r.data!));
  }
}
