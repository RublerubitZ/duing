/**
 * unknown 에러에서 사용자 표시용 message 문자열을 안전하게 추출한다.
 * 구조가 다르면 null 을 반환해 호출 측이 기본 안내 문구로 폴백하도록 한다.
 * (admin faqs/notices/global-events 3곳의 동일 사본을 통합한 앱 공용 헬퍼)
 */
export function extractErrorMessage(error: unknown): string | null {
  if (error && typeof error === 'object' && 'message' in error) {
    // 'in' 내로잉으로 error 가 { message: unknown } 을 포함함이 보장된다 — 'as' 단언 불필요.
    const { message } = error;
    return typeof message === 'string' ? message : null;
  }
  return null;
}
