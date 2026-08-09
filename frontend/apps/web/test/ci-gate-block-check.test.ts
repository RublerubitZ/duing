import { describe, expect, it } from 'vitest';

// 브랜치 보호가 Gate 실패를 머지 차단으로 연결하는지 확인하는 임시 테스트 — 곧 되돌린다.
describe('ci-gate 머지 차단 확인', () => {
  it('의도적으로 실패한다', () => {
    expect(true).toBe(false);
  });
});
