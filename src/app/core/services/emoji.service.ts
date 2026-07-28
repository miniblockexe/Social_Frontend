import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse } from '../models/api.models';
import { Emoji, EmojiCategory } from '../models/emoji.models';

@Injectable({ providedIn: 'root' })
export class EmojiService {
  private readonly http = inject(HttpClient);

  // GET /api/emojis  — kết quả được cache 24h ở BE
  getAll(): Observable<ApiResponse<Emoji[]>> {
    return this.http.get<ApiResponse<Emoji[]>>(`${API_BASE}/emojis`);
  }

  // GET /api/emojis/{category}
  getByCategory(category: EmojiCategory): Observable<ApiResponse<Emoji[]>> {
    return this.http.get<ApiResponse<Emoji[]>>(
      `${API_BASE}/emojis/${category}`,
    );
  }
}
