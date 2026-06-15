import { describe, expect, it } from 'vitest';
import { ApiError } from '@duing/api';
import {
  formatSeconds,
  mapConfirmError,
  mapSendError,
} from '../../../app/(auth)/signup/_lib/email-verification';

describe('formatSeconds', () => {
  it('1200초를 20:00 으로 포맷한다', () => {
    expect(formatSeconds(1200)).toBe('20:00');
  });

  it('61초를 01:01 로 포맷한다', () => {
    expect(formatSeconds(61)).toBe('01:01');
  });

  it('0초를 00:00 으로 포맷한다', () => {
    expect(formatSeconds(0)).toBe('00:00');
  });
});

describe('mapSendError', () => {
  it('409 는 이미 가입된 이메일 안내를 반환한다', () => {
    expect(mapSendError(new ApiError(409, '이미 사용 중인 이메일입니다.'))).toContain('이미 가입된 이메일');
  });

  it('VERIFICATION_RATE_LIMITED 코드는 요청 과다 안내를 반환한다', () => {
    expect(
      mapSendError(new ApiError(429, '요청이 너무 많습니다.', undefined, 'VERIFICATION_RATE_LIMITED')),
    ).toContain('요청이 너무 많아요');
  });

  it('EMAIL_SEND_FAILED 코드는 발송 실패 안내를 반환한다', () => {
    expect(
      mapSendError(new ApiError(502, '발송 실패', undefined, 'EMAIL_SEND_FAILED')),
    ).toContain('발송에 실패했어요');
  });

  it('ApiError 가 아니면 기본 발송 실패 안내를 반환한다', () => {
    expect(mapSendError(new Error('network'))).toContain('발송에 실패했어요');
  });

  it('VERIFICATION_COOLDOWN 코드는 쿨다운 안내를 반환한다', () => {
    expect(
      mapSendError(new ApiError(429, '잠시 후', undefined, 'VERIFICATION_COOLDOWN')),
    ).toContain('다시 발송할 수 있어요');
  });

  it('EMAIL_SEND_QUOTA_EXCEEDED 코드는 발송 실패 안내를 반환한다', () => {
    expect(
      mapSendError(new ApiError(503, '발송 제한', undefined, 'EMAIL_SEND_QUOTA_EXCEEDED')),
    ).toContain('발송에 실패했어요');
  });
});

describe('mapConfirmError', () => {
  it('INVALID_VERIFICATION_CODE 코드는 코드 불일치 안내를 반환한다', () => {
    expect(
      mapConfirmError(new ApiError(400, '인증코드가 올바르지 않습니다.', undefined, 'INVALID_VERIFICATION_CODE')),
    ).toContain('올바르지 않아요');
  });

  it('EMAIL_VERIFICATION_EXPIRED 코드는 재발송 안내를 반환한다', () => {
    expect(
      mapConfirmError(new ApiError(400, '만료', undefined, 'EMAIL_VERIFICATION_EXPIRED')),
    ).toContain('다시 발송');
  });

  it('VERIFICATION_ATTEMPT_EXCEEDED 코드는 시도 초과 안내를 반환한다', () => {
    expect(
      mapConfirmError(new ApiError(429, '초과', undefined, 'VERIFICATION_ATTEMPT_EXCEEDED')),
    ).toContain('시도 횟수를 초과했어요');
  });
});
