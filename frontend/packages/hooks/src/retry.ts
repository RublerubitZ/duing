import { ApiError } from '@duing/api';

// 전역 query 재시도 상한. mutation 은 TanStack Query 기본값(재시도 0)을 그대로 둔다 —
// 비멱등 요청(로그인·제출)의 이중 실행 위험 차단. (스펙 §3.4)
const MAX_QUERY_RETRIES = 1;

// 재시도가 무의미하거나 해로운 오류: 인증 실패(401/403)는 반복해도 결과가 같고,
// TIMEOUT 은 이미 분류별 타임아웃만큼 대기했으므로 재시도가 체감 대기를 배가시킨다.
export function isNonRetryableError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.code === 'TIMEOUT')
  );
}

// QueryClient defaultOptions.queries.retry 에 그대로 전달하는 전역 정책.
// 빠른 실패(NETWORK·연결 거부·5xx)는 1회 재시도 가치가 있어 유지한다.
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isNonRetryableError(error)) {
    return false;
  }
  return failureCount < MAX_QUERY_RETRIES;
}
