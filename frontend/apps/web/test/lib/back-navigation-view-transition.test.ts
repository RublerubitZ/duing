import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom 에는 document.startViewTransition 이 없다 — 테스트마다 필요에 따라 mock 을 정의하고
// vi.resetModules() 로 모듈 top-level 상태(installed 플래그)를 초기화한 뒤 동적 import 해야 한다.
function createViewTransitionMock(finished: Promise<void> = Promise.resolve()): ViewTransition {
  return {
    finished,
    ready: Promise.resolve(),
    updateCallbackDone: Promise.resolve(),
    types: new Set<string>(),
    skipTransition: () => undefined,
  };
}

// finished 를 테스트 코드에서 원하는 시점에 수동으로 resolve 하기 위한 헬퍼 — 연속 popstate 시나리오는
// 두 전환의 finished 순서를 직접 통제해야 한다.
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

let registeredPopstateListener: EventListenerOrEventListenerObject | null = null;

// jsdom 의 window/document 는 테스트 파일 전체에서 공유된다 — 모듈을 새로 로드해 설치할 때마다
// 등록된 popstate 리스너를 스파이로 잡아둔다. afterEach 에서 명시적으로 해제하지 않으면
// 이전 테스트에서 등록된 리스너가 다음 테스트의 popstate 디스패치에도 겹쳐 반응해 결과가 오염된다.
async function loadAndInstallGuard() {
  vi.resetModules();
  const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
  const { installBackNavigationViewTransitionGuard } = await import(
    '@/app/_lib/backNavigationViewTransition'
  );
  installBackNavigationViewTransitionGuard();

  const popstateCall = addEventListenerSpy.mock.calls.find(([eventName]) => eventName === 'popstate');
  registeredPopstateListener = popstateCall?.[1] ?? null;
  addEventListenerSpy.mockRestore();
}

afterEach(() => {
  if (registeredPopstateListener) {
    window.removeEventListener('popstate', registeredPopstateListener);
    registeredPopstateListener = null;
  }
  document.documentElement.removeAttribute('data-back-navigation');
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.useRealTimers();
});

describe('installBackNavigationViewTransitionGuard', () => {
  it('popstate 디스패치 시 data-back-navigation 속성이 세팅된다', async () => {
    document.startViewTransition = () => createViewTransitionMock();
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(true);
  });

  it('popstate 후 시작된 전환의 finished 가 resolve 되면(+마이크로태스크 flush) 속성이 제거된다', async () => {
    document.startViewTransition = () => createViewTransitionMock();
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));
    document.startViewTransition(() => undefined);

    // finished.catch().finally() 체인이 모두 flush 되도록 매크로태스크 경계까지 대기한다.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(false);
  });

  it('popstate 없이 시작된 전환(전진 내비게이션)은 마커를 세팅하지 않고 반환값을 그대로 넘긴다', async () => {
    const transitionMock = createViewTransitionMock();
    document.startViewTransition = () => transitionMock;
    await loadAndInstallGuard();

    const result = document.startViewTransition(() => undefined);

    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(false);
    expect(result).toBe(transitionMock);
  });

  it('startViewTransition 미지원 환경에서는 설치가 no-op 이다', async () => {
    Reflect.deleteProperty(document, 'startViewTransition');
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(false);
  });

  it('전환이 시작되지 않아도 2000ms 뒤 failsafe 로 속성이 제거된다', async () => {
    vi.useFakeTimers();
    document.startViewTransition = () => createViewTransitionMock();
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(true);

    vi.advanceTimersByTime(2000);

    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(false);
  });

  it('연속 popstate 시 첫 번째(스킵된) 전환의 finished 가 두 번째 마커를 지우지 않는다', async () => {
    const firstDeferred = createDeferred<void>();
    const secondDeferred = createDeferred<void>();
    const transitions = [
      createViewTransitionMock(firstDeferred.promise),
      createViewTransitionMock(secondDeferred.promise),
    ];
    let callCount = 0;
    document.startViewTransition = () => {
      const transition = transitions[callCount];
      if (!transition) throw new Error('startViewTransition 이 준비된 mock 보다 많이 호출됐다');
      callCount += 1;
      return transition;
    };
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));
    document.startViewTransition(() => undefined);

    window.dispatchEvent(new PopStateEvent('popstate'));
    document.startViewTransition(() => undefined);

    firstDeferred.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 이전 세대의 finished 는 최신 마커를 지우지 못한다 — 두 번째 뒤로가기의 억제가 유지돼야 한다.
    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(true);

    secondDeferred.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(false);
  });

  it('전환이 마커를 인수하면 느린 라우트 커밋(>2000ms)에도 failsafe 가 조기 해제하지 않는다', async () => {
    vi.useFakeTimers();
    const deferred = createDeferred<void>();
    document.startViewTransition = () => createViewTransitionMock(deferred.promise);
    await loadAndInstallGuard();

    window.dispatchEvent(new PopStateEvent('popstate'));
    document.startViewTransition(() => undefined);

    await vi.advanceTimersByTimeAsync(2500);

    // failsafe 는 전환이 마커를 인수한 시점에 취소됐어야 한다 — 느린 커밋에서도 마커가 살아있어야 한다.
    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(true);

    deferred.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(document.documentElement.hasAttribute('data-back-navigation')).toBe(false);
  });
});
