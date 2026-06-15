import { ApiError } from '@duing/api';

export const RESEND_COOLDOWN_SECONDS = 60;

export function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function mapSendError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'VERIFICATION_COOLDOWN') return '잠시 후 다시 발송할 수 있어요.';
    if (error.code === 'VERIFICATION_RATE_LIMITED') return '요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
    if (error.code === 'EMAIL_SEND_FAILED' || error.code === 'EMAIL_SEND_QUOTA_EXCEEDED') {
      return '발송에 실패했어요. 잠시 후 다시 시도해주세요.';
    }
    if (error.status === 409) return '이미 가입된 이메일이에요. 로그인해 주세요.';
    return error.message;
  }
  return '발송에 실패했어요. 잠시 후 다시 시도해주세요.';
}

export function mapConfirmError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INVALID_VERIFICATION_CODE') return '인증코드가 올바르지 않아요.';
    if (error.code === 'VERIFICATION_ATTEMPT_EXCEEDED') {
      return '시도 횟수를 초과했어요. 인증코드를 다시 발송해주세요.';
    }
    if (error.code === 'EMAIL_VERIFICATION_EXPIRED' || error.code === 'EMAIL_VERIFICATION_NOT_FOUND') {
      return '인증코드가 만료되었어요. 다시 발송해주세요.';
    }
    return error.message;
  }
  return '확인에 실패했어요. 다시 시도해주세요.';
}
