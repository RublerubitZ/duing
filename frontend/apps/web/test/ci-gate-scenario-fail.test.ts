import { describe, expect, it } from 'vitest';

// ci-gate 실패 전파 검증용 임시 테스트 — 병합하지 않는다.
describe('ci-gate 시나리오 F', () => {
  it('게이트가 프론트 CI 실패를 실패로 전파하는지 확인하기 위해 의도적으로 실패한다', () => {
    expect(true).toBe(false);
  });
});
