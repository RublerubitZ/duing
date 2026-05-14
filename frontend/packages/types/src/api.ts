// 백엔드 ApiResponse<T> / PageResponse<T> 매핑.
// 백엔드: { ok: boolean, data: T | null, message: string | null }

export interface ApiResponse<T> {
  ok: boolean;
  data: T | null;
  message: string | null;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
}
