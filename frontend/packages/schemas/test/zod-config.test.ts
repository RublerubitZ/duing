import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// 운영 CSP(Report-Only)의 script-src 에 'unsafe-eval' 이 없다 — zod 4 의 JIT(new Function)가 켜져 있으면 객체 스키마를
// 만들 때와 동기 검사 때 위반이 보고된다. JIT 여부는 객체 스키마를 만들 때 정해지므로 스키마 모듈이 먼저 꺼야 한다.
describe('zod 전역 설정', () => {
  it('공유 스키마 모듈을 불러오면 JIT 가 꺼진다(jitless)', async () => {
    await import('../src/index');
    expect(z.config().jitless).toBe(true);
  });
});
