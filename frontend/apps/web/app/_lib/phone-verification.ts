import { ApiError } from '@duing/api';

export const RESEND_COOLDOWN_SECONDS = 60;
export const SMS_TIMEOUT_SECONDS = 300; // 세션 TTL(5분)과 정렬 (spec §4.3)

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function isIosUserAgent(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent);
}

export function isMobileUserAgent(userAgent: string): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
}

/**
 * SMS 딥링크. iOS 는 비표준 `&body=`, 그 외(Android Chromium)는 `?body=` (spec §4.1).
 * 실기기 보장이 없으므로 호출부는 항상 수신번호·코드 수동 폴백을 함께 노출한다.
 */
export function buildSmsDeeplink(moNumber: string, code: string, ios: boolean): string {
  const separator = ios ? '&' : '?';
  return `sms:${moNumber}${separator}body=${encodeURIComponent(code)}`;
}

export function mapIssueError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PHONE_ALREADY_REGISTERED') return '이미 가입된 번호예요. 로그인해 주세요.';
    if (error.code === 'PHONE_VERIFICATION_COOLDOWN') return '잠시 후 다시 시도할 수 있어요.';
    if (error.code === 'VERIFICATION_RATE_LIMITED') return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
    if (error.status === 409) return '이미 가입된 번호예요. 로그인해 주세요.';
    return error.message;
  }
  return '인증 시작에 실패했어요. 잠시 후 다시 시도해주세요.';
}

export function mapStatusError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'SMS_POLL_QUOTA_EXCEEDED') return '일시적으로 인증 확인이 제한됐어요. 잠시 후 다시 시도해주세요.';
    if (error.code === 'PHONE_VERIFICATION_NOT_FOUND') return '인증 세션을 찾을 수 없어요. 다시 시작해주세요.';
    return error.message;
  }
  return '인증 확인 중 문제가 발생했어요.';
}
