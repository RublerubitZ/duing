import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

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
