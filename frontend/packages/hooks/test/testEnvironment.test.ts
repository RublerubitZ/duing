import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

// vitest.config.ts 의 `globals: true` 가 빠지면 RTL 이 자동 cleanup·act 환경을 등록하지 못해 실패한다 —
// 그러면 renderHook 트리가 다음 테스트까지 남아 순서에 따라 결과가 바뀐다(profileCheck 404 셔플 실패).
describe('hooks 테스트 환경', () => {
  // 두 테스트 모두 시작할 때 앞 테스트의 렌더가 없는지 본다 — 셔플로 어느 쪽이 먼저 돌아도 뒤의 것이 잡는다.
  it.each(['첫째', '둘째'])('%s: 앞 테스트의 렌더가 정리돼 있고 act 환경이 켜져 있다', () => {
    expect(document.body.childElementCount).toBe(0);
    expect(Reflect.get(globalThis, 'IS_REACT_ACT_ENVIRONMENT')).toBe(true);
    renderHook(() => null);
  });
});
