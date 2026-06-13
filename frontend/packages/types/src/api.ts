// 백엔드 ApiResponse<T> / PageResponse<T> 매핑.
// 백엔드: { ok: boolean, data: T | null, message: string | null, code?: string }
// code 는 백엔드에서 null 이면 직렬화 생략 → optional.

export type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  message: string | null;
  code?: string;
};

export type PageResponse<T> = {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
};