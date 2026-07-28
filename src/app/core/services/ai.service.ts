import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse } from '../models/api.models';
import {
  GeminiChatRequest,
  GeminiChatResponse,
  AiHealthStatus,
} from '../models/ai.models';

@Injectable({ providedIn: 'root' })
export class AiService {
  private readonly http = inject(HttpClient);

  // POST /api/ai/chat  [Authorize]
  // Rate limit: 10 lần/phút per user
  chat(dto: GeminiChatRequest): Observable<ApiResponse<GeminiChatResponse>> {
    return this.http.post<ApiResponse<GeminiChatResponse>>(
      `${API_BASE}/ai/chat`,
      dto,
    );
  }

  // GET /api/ai/health  [AllowAnonymous]
  healthCheck(): Observable<ApiResponse<AiHealthStatus>> {
    return this.http.get<ApiResponse<AiHealthStatus>>(`${API_BASE}/ai/health`);
  }
}
