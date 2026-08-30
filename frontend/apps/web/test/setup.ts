import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { afterAll, vi } from 'vitest';

/**
 * Radix 계열(FocusScope·DismissableLayer)은 언마운트 정리를 `setTimeout(0)` 으로 미룬다.
 *
 * <p>파일의 마지막 테스트가 다이얼로그를 열어둔 채 끝나면, RTL 자동 cleanup 이 언마운트하며 건 그
 * 타이머가 jsdom 환경이 헐린 뒤에 발화한다. 그러면 `Failed to execute 'dispatchEvent'` 가
 * uncaught 로 잡혀 <b>테스트는 전부 통과인데 종료 코드만 1</b> 인 간헐 실패가 된다
 * (2026-08 payment-history 에서 실제로 관측 — 파일·부하에 따라 재현이 들쭉날쭉하다).
 *
 * <p>파일당 한 번 매크로태스크를 흘려, 살아 있는 jsdom 에서 그 타이머를 소진시킨다.
 * `afterAll` 인 이유는 순서 보장이다 — 모든 `afterEach`(RTL cleanup 포함)가 끝난 뒤에 실행된다.
 * `afterEach` 에 두면 등록 순서에 따라 cleanup 보다 먼저 돌 수 있어 아무것도 흘려보내지 못한다.
 */
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// next-view-transitions 의 Link/ViewTransitions 는 <ViewTransitions> 컨텍스트가 없으면 렌더 시 throw 한다.
// jsdom 단위 테스트는 컴포넌트를 단독 렌더하므로, 전역 모킹으로 Link → 일반 anchor,
// ViewTransitions → passthrough 로 대체한다. (실제 페이지 전환은 브라우저에서만 동작)
vi.mock('next-view-transitions', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ children, href, ...rest }: { children?: ReactNode; href: string }) =>
      createElement('a', { href, ...rest }, children),
    ViewTransitions: ({ children }: { children?: ReactNode }) => children,
    useTransitionRouter: () => ({
      push: () => undefined,
      replace: () => undefined,
      back: () => undefined,
      forward: () => undefined,
      prefetch: () => undefined,
      refresh: () => undefined,
    }),
  };
});
