import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRefreshCoordinator } from '../src/refresh-coordinator';
import type { RefreshOutcome } from '../src/refresh-coordinator';

// vitest 환경이 node 라 localStorage 가 없다 — 코디네이터가 읽고 쓰는 대상을
// 인메모리 Storage 로 심어 탭 내 in-flight 폴백 경로(navigator.locks 부재)를 검증한다.
function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  const memoryStorage = {
    getItem: (key: string) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  });
}

installMemoryLocalStorage();

// jsdom 에는 navigator.locks 가 없다 — 탭 내 in-flight 공유 폴백 경로가 검증 대상이다.
describe('refresh coordinator', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function deferredRefresh() {
    let resolve!: (outcome: RefreshOutcome) => void;
    const executeRefresh = vi.fn(
      () => new Promise<RefreshOutcome>((res) => { resolve = res; }),
    );
    return { executeRefresh, resolveWith: (outcome: RefreshOutcome) => resolve(outcome) };
  }

  it('동시에 두 번 요청해도 갱신 실행은 한 번이고 같은 결과를 공유한다', async () => {
    const { executeRefresh, resolveWith } = deferredRefresh();
    const coordinator = createRefreshCoordinator(executeRefresh);

    const first = coordinator.ensureFreshSession();
    const second = coordinator.ensureFreshSession();
    resolveWith('refreshed');

    await expect(first).resolves.toBe('refreshed');
    await expect(second).resolves.toBe('refreshed');
    expect(executeRefresh).toHaveBeenCalledTimes(1);
  });

  it('직전 갱신 후에는 새 in-flight 가 다시 실행된다(영구 캐시 아님)', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>()
      .mockResolvedValue('session-expired');
    const coordinator = createRefreshCoordinator(executeRefresh);

    await expect(coordinator.ensureFreshSession()).resolves.toBe('session-expired');
    await expect(coordinator.ensureFreshSession()).resolves.toBe('session-expired');
    expect(executeRefresh).toHaveBeenCalledTimes(2);
  });

  it('다른 탭이 10초 안에 갱신한 기록이 있으면 실행 없이 skipped 를 반환한다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('refreshed');
    const coordinator = createRefreshCoordinator(executeRefresh);
    localStorage.setItem('duing:auth:web-refreshed-at', String(Date.now() - 3_000));

    await expect(coordinator.ensureFreshSession()).resolves.toBe('skipped');
    expect(executeRefresh).not.toHaveBeenCalled();
  });

  it('갱신 성공 시각을 기록하고, 10초가 지난 기록은 생략 사유가 되지 않는다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('refreshed');
    const coordinator = createRefreshCoordinator(executeRefresh);
    localStorage.setItem('duing:auth:web-refreshed-at', String(Date.now() - 11_000));

    await expect(coordinator.ensureFreshSession()).resolves.toBe('refreshed');
    expect(executeRefresh).toHaveBeenCalledTimes(1);
    expect(Number(localStorage.getItem('duing:auth:web-refreshed-at'))).toBeGreaterThan(0);
  });

  it('실패(unavailable) 는 갱신 시각을 기록하지 않는다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('unavailable');
    const coordinator = createRefreshCoordinator(executeRefresh);

    await expect(coordinator.ensureFreshSession()).resolves.toBe('unavailable');
    expect(localStorage.getItem('duing:auth:web-refreshed-at')).toBeNull();
  });
});
