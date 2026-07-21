import { describe, expect, it } from 'vitest';
import { phoneVerificationPollIntervalMs } from '../src/auth';

describe('phoneVerificationPollIntervalMs', () => {
  it('초반 5폴은 3초, 8폴까지 5초, 이후 8초로 넓어진다 — 서버 실호출 사다리(2.5s→4.5s→7.5s)보다 항상 넓다', () => {
    expect(phoneVerificationPollIntervalMs(0)).toBe(3_000);
    expect(phoneVerificationPollIntervalMs(4)).toBe(3_000);
    expect(phoneVerificationPollIntervalMs(5)).toBe(5_000);
    expect(phoneVerificationPollIntervalMs(7)).toBe(5_000);
    expect(phoneVerificationPollIntervalMs(8)).toBe(8_000);
    expect(phoneVerificationPollIntervalMs(100)).toBe(8_000);
  });

  // 백엔드 MoPollThrottle 의 세션당 실호출 사다리(2.5s/4.5s/7.5s, 경계 5·8콜)와 커플링 가드 —
  // 한쪽만 바꾸면 폴링이 서버 스로틀에 걸려 벤더 미호출로 헛도는 구간이 생긴다 (MoPollThrottleTest 에 대칭 가드 존재).
  it('각 티어 간격은 서버 최소 간격보다 0.5초 이상 넓다', () => {
    expect(phoneVerificationPollIntervalMs(0)).toBeGreaterThanOrEqual(2_500 + 500);
    expect(phoneVerificationPollIntervalMs(5)).toBeGreaterThanOrEqual(4_500 + 500);
    expect(phoneVerificationPollIntervalMs(8)).toBeGreaterThanOrEqual(7_500 + 500);
  });
});
