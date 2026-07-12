import { describe, it, expect } from 'vitest';
import { ApiError, TIMEOUT_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from '@duing/api';
import { shouldRetryQuery, isNonRetryableError } from '../src/retry';

describe('shouldRetryQuery', () => {
  it('401/403 은 재시도하지 않는다', () => {
    expect(shouldRetryQuery(0, new ApiError(401, '인증 필요'))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(403, '권한 없음'))).toBe(false);
  });

  it('TIMEOUT 은 재시도하지 않는다 — 이미 분류별 타임아웃만큼 대기했으므로 재시도는 체감 대기를 배가시킨다', () => {
    expect(shouldRetryQuery(0, new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT'))).toBe(false);
  });

  it('빠른 실패(NETWORK)와 5xx 는 1회만 재시도한다', () => {
    const networkError = new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
    expect(shouldRetryQuery(0, networkError)).toBe(true);
    expect(shouldRetryQuery(1, networkError)).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(500, '서버 오류'))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(500, '서버 오류'))).toBe(false);
  });

  it('ApiError 가 아닌 오류도 1회만 재시도한다', () => {
    expect(shouldRetryQuery(0, new Error('unknown'))).toBe(true);
    expect(shouldRetryQuery(1, new Error('unknown'))).toBe(false);
  });
});

describe('isNonRetryableError', () => {
  it('401·403·TIMEOUT 만 true', () => {
    expect(isNonRetryableError(new ApiError(401, 'x'))).toBe(true);
    expect(isNonRetryableError(new ApiError(403, 'x'))).toBe(true);
    expect(isNonRetryableError(new ApiError(0, 'x', undefined, 'TIMEOUT'))).toBe(true);
    expect(isNonRetryableError(new ApiError(0, 'x', undefined, 'NETWORK'))).toBe(false);
    expect(isNonRetryableError(new ApiError(404, 'x'))).toBe(false);
    expect(isNonRetryableError(new Error('x'))).toBe(false);
  });
});
