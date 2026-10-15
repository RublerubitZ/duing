import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// 마커 해제 컴포넌트가 읽는 경로 — 테스트가 바꿔 가며 다시 렌더한다.
const navigationState = vi.hoisted(() => ({ pathname: '/clubs' }));
vi.mock('next/navigation', () => ({ usePathname: () => navigationState.pathname }));

const MARKER = 'data-back-navigation';
let registeredPopstateListener: EventListenerOrEventListenerObject | null = null;

// 모듈 상단 상태(installed·타이머)를 테스트마다 새로 잡는다. 오버레이 판정은 mock 으로 통제하고(실제 backDismiss 와의
// 통합은 back-navigation-marker-overlay.test.tsx), 가드가 단 popstate 리스너는 afterEach 에서 떼어 다음 테스트에 새지 않게 한다.
async function loadAndInstallGuard(options: { overlayOnly?: () => boolean } = {}) {
  vi.useFakeTimers();
  vi.resetModules();
  const installBackDismiss = vi.fn();
  vi.doMock('@/app/_lib/backDismiss', () => ({
    isOverlayOnlyTraversal: options.overlayOnly ?? (() => false),
    installBackDismiss,
  }));
  const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
  const guard = await import('@/app/_lib/backNavigationViewTransition');
  guard.installBackNavigationViewTransitionGuard();
  const popstateCall = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'popstate');
  registeredPopstateListener = popstateCall?.[1] ?? null;
  addEventListenerSpy.mockRestore();
  return { guard, installBackDismiss };
}

function hasMarker() {
  return document.documentElement.hasAttribute(MARKER);
}

afterEach(() => {
  vi.unstubAllGlobals();
  if (registeredPopstateListener) {
    window.removeEventListener('popstate', registeredPopstateListener);
    registeredPopstateListener = null;
  }
  document.documentElement.removeAttribute(MARKER);
  Reflect.deleteProperty(document, 'startViewTransition');
  navigationState.pathname = '/clubs';
  vi.useRealTimers();
  vi.doUnmock('@/app/_lib/backDismiss');
});

describe('installBackNavigationViewTransitionGuard', () => {
  it('popstate 에 마커를 세운다', async () => {
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(hasMarker()).toBe(true);
  });

  it('오버레이만 닫는 popstate 에는 마커를 세우지 않는다 — 이어지는 앞으로 이동이 뒤로 가기로 읽히지 않게', async () => {
    await loadAndInstallGuard({ overlayOnly: () => true });

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(hasMarker()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('오버레이 전용 popstate 는 앞서 세운 마커와 failsafe 를 건드리지 않는다 — 죽은 엔트리 2-hop 의 두 번째 hop', async () => {
    let overlayOnly = false;
    await loadAndInstallGuard({ overlayOnly: () => overlayOnly });

    window.dispatchEvent(new PopStateEvent('popstate')); // 첫 hop — 페이지가 바뀜
    vi.advanceTimersByTime(1500);
    overlayOnly = true;
    window.dispatchEvent(new PopStateEvent('popstate')); // 두 번째 hop — 같은 페이지
    expect(hasMarker()).toBe(true);
    vi.advanceTimersByTime(499); // 첫 hop 기준 1999ms — 타이머가 다시 잡히지 않았다
    expect(hasMarker()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hasMarker()).toBe(false);
  });

  it('오버레이 판정 리스너가 먼저 등록되도록 backDismiss 를 먼저 설치한다', async () => {
    const { installBackDismiss } = await loadAndInstallGuard();

    expect(installBackDismiss).toHaveBeenCalledTimes(1);
  });

  it('경로 커밋이 없으면 2000ms 뒤 failsafe 로 내린다', async () => {
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));
    vi.advanceTimersByTime(1999);
    expect(hasMarker()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hasMarker()).toBe(false);
  });

  it('연속 popstate 는 failsafe 를 마지막 popstate 기준으로 다시 잡는다', async () => {
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));
    vi.advanceTimersByTime(1500);
    window.dispatchEvent(new PopStateEvent('popstate'));
    vi.advanceTimersByTime(1999);
    expect(hasMarker()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hasMarker()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('startViewTransition 을 감싸지 않는다 — 앞으로 이동 전환은 원래 함수가 그대로 받는다', async () => {
    const original = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { value: original, configurable: true, writable: true });

    await loadAndInstallGuard();

    expect(document.startViewTransition).toBe(original);
  });

  it('View Transition 미지원 환경(jsdom 기본)에서도 설치된다', async () => {
    expect('startViewTransition' in document).toBe(false);
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(hasMarker()).toBe(true);
  });

  it('두 번 호출해도 리스너는 하나다', async () => {
    const { guard } = await loadAndInstallGuard();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    guard.installBackNavigationViewTransitionGuard();

    expect(addEventListenerSpy.mock.calls.filter(([eventName]) => eventName === 'popstate')).toHaveLength(0);
    addEventListenerSpy.mockRestore();
  });
});

describe('BackNavigationMarkerReset', () => {
  it('경로가 바뀐 커밋에서 마커와 failsafe 를 함께 내린다', async () => {
    const { guard } = await loadAndInstallGuard();
    const { rerender } = render(<guard.BackNavigationMarkerReset />);

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(hasMarker()).toBe(true);
    navigationState.pathname = '/clubs/38';
    rerender(<guard.BackNavigationMarkerReset />);

    expect(hasMarker()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('경로가 그대로인 리렌더는 마커를 건드리지 않는다', async () => {
    const { guard } = await loadAndInstallGuard();
    const { rerender } = render(<guard.BackNavigationMarkerReset />);

    window.dispatchEvent(new PopStateEvent('popstate'));
    rerender(<guard.BackNavigationMarkerReset />);

    expect(hasMarker()).toBe(true);
  });

  it('새 화면은 같은 커밋의 해제 effect 보다 먼저 렌더 중에 마커를 읽는다', async () => {
    const { guard } = await loadAndInstallGuard();
    const readsDuringRender: boolean[] = [];
    function Screen() {
      readsDuringRender.push(guard.isBackNavigationPending());
      return null;
    }
    const { rerender } = render(<guard.BackNavigationMarkerReset />);

    window.dispatchEvent(new PopStateEvent('popstate'));
    navigationState.pathname = '/notices';
    rerender(
      <>
        <guard.BackNavigationMarkerReset />
        <Screen />
      </>,
    );

    expect(readsDuringRender.length).toBeGreaterThan(0);
    expect(readsDuringRender.every(Boolean)).toBe(true);
    expect(hasMarker()).toBe(false);
  });
});

describe('isBackNavigationPending', () => {
  it('마커 속성이 있을 때만 참이다', async () => {
    const { guard } = await loadAndInstallGuard();

    expect(guard.isBackNavigationPending()).toBe(false);
    document.documentElement.setAttribute(MARKER, '');
    expect(guard.isBackNavigationPending()).toBe(true);
  });

  it('문서가 없는 서버 렌더에서는 거짓이다', async () => {
    const { guard } = await loadAndInstallGuard();

    document.documentElement.setAttribute(MARKER, '');
    vi.stubGlobal('document', undefined);
    try {
      expect(guard.isBackNavigationPending()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
