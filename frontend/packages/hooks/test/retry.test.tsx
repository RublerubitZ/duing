import { describe, it, expect } from 'vitest';
import { ApiError, TIMEOUT_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from '@duing/api';
import { shouldRetryQuery, isNonRetryableError, retryUnlessStatuses } from '../src/retry';

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

describe('retryUnlessStatuses', () => {
  it('넘긴 status 는 재시도하지 않는다', () => {
    const retryUnlessNotFound = retryUnlessStatuses(404);
    expect(retryUnlessNotFound(0, new ApiError(404, '없음'))).toBe(false);

    const retryUnlessGone = retryUnlessStatuses(404, 410);
    expect(retryUnlessGone(0, new ApiError(404, '없음'))).toBe(false);
    expect(retryUnlessGone(0, new ApiError(410, '삭제됨'))).toBe(false);
  });

  it('넘기지 않은 오류는 전역 상한(1회)만큼만 재시도한다 — 로컬 상한 복제 금지', () => {
    const retryUnlessNotFound = retryUnlessStatuses(404);
    const serverError = new ApiError(500, '서버 오류');
    expect(retryUnlessNotFound(0, serverError)).toBe(true);
    expect(retryUnlessNotFound(1, serverError)).toBe(false);

    const networkError = new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
    expect(retryUnlessNotFound(0, networkError)).toBe(true);
    expect(retryUnlessNotFound(1, networkError)).toBe(false);
  });

  it('전역 비재시도(401·403·TIMEOUT)가 우선한다 — status 를 넘기지 않아도 재시도하지 않는다', () => {
    const retryUnlessNotFound = retryUnlessStatuses(404);
    expect(retryUnlessNotFound(0, new ApiError(401, '인증 필요'))).toBe(false);
    expect(retryUnlessNotFound(0, new ApiError(403, '권한 없음'))).toBe(false);
    expect(
      retryUnlessNotFound(0, new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT')),
    ).toBe(false);
  });

  it('인자 없이 만들면 전역 정책과 같고, ApiError 가 아닌 오류는 status 제외에 걸리지 않는다', () => {
    const retryLikeGlobal = retryUnlessStatuses();
    expect(retryLikeGlobal(0, new ApiError(404, '없음'))).toBe(true);
    expect(retryLikeGlobal(1, new ApiError(404, '없음'))).toBe(false);
    expect(retryUnlessStatuses(404)(0, new Error('unknown'))).toBe(true);
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
