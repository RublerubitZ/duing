import { act, render, screen } from '@testing-library/react';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toRoute } from '@/app/_lib/route';

// test/setup.ts 가 next-view-transitions 를 전역 mock 한다 — 패치가 실제로 적용됐는지는 실제 모듈로만 확인된다.
type ViewTransitionsModule = typeof import('next-view-transitions');

// jsdom 에는 startViewTransition 이 없다. 업데이트 콜백을 비동기로 부르는 최소 흉내.
function stubStartViewTransition() {
  const startViewTransition = vi.fn((callback?: ViewTransitionUpdateCallback): ViewTransition => {
    const updateCallbackDone = Promise.resolve()
      .then(() => callback?.())
      .then(() => undefined);
    return {
      finished: updateCallbackDone,
      ready: updateCallbackDone,
      updateCallbackDone,
      types: new Set<string>(),
      skipTransition: () => undefined,
    };
  });
  Object.defineProperty(document, 'startViewTransition', {
    value: startViewTransition,
    configurable: true,
    writable: true,
  });
  return startViewTransition;
}

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
});

describe('next-view-transitions 패치(frontend/patches)', () => {
  // popstate 전환은 새 경로 렌더를 스크린샷 뒤로 미뤄 브라우저 스크롤 복원이 떠나는 화면에 적용됐다
  // (목록 위치 상실·떠나는 화면 튐, 2026-10-13 운영 실측). 패치가 빠지면 이 테스트가 실패한다.
  it('ViewTransitions 는 popstate 에 전환을 시작하지 않는다', async () => {
    const startViewTransition = stubStartViewTransition();
    const actual = await vi.importActual<ViewTransitionsModule>('next-view-transitions');
    render(
      <actual.ViewTransitions>
        <p>본문</p>
      </actual.ViewTransitions>,
    );

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    expect(startViewTransition).not.toHaveBeenCalled();
  });

  it('앞으로 이동 Link 는 그대로 전환을 시작하고 router.push 로 이동한다', async () => {
    const startViewTransition = stubStartViewTransition();
    const actual = await vi.importActual<ViewTransitionsModule>('next-view-transitions');
    const push = vi.fn();
    render(
      <AppRouterContext.Provider
        value={{
          back: vi.fn(),
          forward: vi.fn(),
          refresh: vi.fn(),
          push,
          replace: vi.fn(),
          prefetch: vi.fn(),
          bfcacheId: 'test',
        }}
      >
        <actual.ViewTransitions>
          <actual.Link href={toRoute('/clubs/1')}>상세로</actual.Link>
        </actual.ViewTransitions>
      </AppRouterContext.Provider>,
    );

    await act(async () => {
      screen.getByText('상세로').click();
    });

    expect(startViewTransition).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/clubs/1', { scroll: true });
  });
});
