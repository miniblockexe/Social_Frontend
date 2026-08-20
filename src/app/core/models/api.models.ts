export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  errors: string[];
}

// Khớp đúng field JSON thực tế do backend trả về (CamelCase JsonNamingPolicy
// áp lên PagedResult<T>.PageNumber / .PageSize của C# — KHÔNG PHẢI "page"/"size").
export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
}