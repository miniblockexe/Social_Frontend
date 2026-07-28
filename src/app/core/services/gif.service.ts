import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { API_BASE } from '../constants/api.constants';
import { ApiResponse } from '../models/api.models';
import { GifResult } from '../models/gif.models';

@Injectable({ providedIn: 'root' })
export class GifService {
  private readonly http = inject(HttpClient);

  searchGifs(
    query: string,
    limit = 20,
    // pos là cursor string từ Tenor (NextOffset serialize thành số nhưng
    // BE nhận qua [FromQuery] string? pos) — phải stringify trước khi gửi
    nextOffset?: number | null,
  ): Observable<ApiResponse<GifResult>> {
    const params: Record<string, string | number> = { q: query, limit };
    if (nextOffset != null) params['pos'] = String(nextOffset);
    return this.http.get<ApiResponse<GifResult>>(`${API_BASE}/gifs/search`, {
      params,
    });
  }

  getTrendingGifs(limit = 20): Observable<ApiResponse<GifResult>> {
    return this.http.get<ApiResponse<GifResult>>(`${API_BASE}/gifs/trending`, {
      params: { limit },
    });
  }
}
