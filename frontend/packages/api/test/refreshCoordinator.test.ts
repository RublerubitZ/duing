import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStorage, type Storage } from '@duing/storage';

import { createRefreshCoordinator, registerRefreshLockAdapter } from '../src/refresh-coordinator';
import type { RefreshOutcome } from '../src/refresh-coordinator';

const LAST_REFRESH_STORAGE_KEY = 'duing:auth:web-refreshed-at';

// vitest 환경(node)엔 localStorage 가 없다 — 코디네이터가 읽고 쓰는 @duing/storage 를
// 인메모리 Map 으로 심어, 크로스탭 락 어댑터 미등록 시의 탭 내 in-flight 폴백 경로를 검증한다.
const store = new Map<string, string>();
const memoryStorage: Storage = {
  getItem: async (key) => store.get(key) ?? null,
  setItem: async (key, value) => {
    store.set(key, value);
  },
  removeItem: async (key) => {
    store.delete(key);
  },
};

describe('refresh coordinator', () => {
  beforeEach(() => {
    setStorage(memoryStorage);
    store.clear();
    registerRefreshLockAdapter(null); // 어댑터 미등록 = in-flight 폴백 경로
  });
  afterEach(() => {
    registerRefreshLockAdapter(null);
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
    expect(first).toBe(second); // 동기적으로 같은 in-flight 를 공유한다

    // storage 조회가 async 라 executeRefresh 는 마이크로태스크 뒤에 호출된다 — 그 뒤 resolve.
    await vi.waitFor(() => expect(executeRefresh).toHaveBeenCalledTimes(1));
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
    store.set(LAST_REFRESH_STORAGE_KEY, String(Date.now() - 3_000));

    await expect(coordinator.ensureFreshSession()).resolves.toBe('skipped');
    expect(executeRefresh).not.toHaveBeenCalled();
  });

  it('갱신 성공 시각을 기록하고, 10초가 지난 기록은 생략 사유가 되지 않는다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('refreshed');
    const coordinator = createRefreshCoordinator(executeRefresh);
    store.set(LAST_REFRESH_STORAGE_KEY, String(Date.now() - 11_000));

    await expect(coordinator.ensureFreshSession()).resolves.toBe('refreshed');
    expect(executeRefresh).toHaveBeenCalledTimes(1);
    expect(Number(store.get(LAST_REFRESH_STORAGE_KEY))).toBeGreaterThan(0);
  });

  it('미래 타임스탬프(시계 역행)는 생략 사유가 되지 않고 갱신을 실행한다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('refreshed');
    const coordinator = createRefreshCoordinator(executeRefresh);
    store.set(LAST_REFRESH_STORAGE_KEY, String(Date.now() + 60_000));

    await expect(coordinator.ensureFreshSession()).resolves.toBe('refreshed');
    expect(executeRefresh).toHaveBeenCalledTimes(1);
  });

  it('실패(unavailable) 는 갱신 시각을 기록하지 않는다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('unavailable');
    const coordinator = createRefreshCoordinator(executeRefresh);

    await expect(coordinator.ensureFreshSession()).resolves.toBe('unavailable');
    expect(store.get(LAST_REFRESH_STORAGE_KEY)).toBeUndefined();
  });

  it('등록된 크로스탭 락 어댑터가 갱신 실행을 감싸고 결과를 그대로 전달한다', async () => {
    const executeRefresh = vi.fn<() => Promise<RefreshOutcome>>().mockResolvedValue('refreshed');
    const lockTrace: string[] = [];
    registerRefreshLockAdapter(async (task) => {
      lockTrace.push('enter');
      const outcome = await task();
      lockTrace.push('exit');
      return outcome;
    });
    const coordinator = createRefreshCoordinator(executeRefresh);

    await expect(coordinator.ensureFreshSession()).resolves.toBe('refreshed');
    expect(lockTrace).toEqual(['enter', 'exit']);
    expect(executeRefresh).toHaveBeenCalledTimes(1);
  });
});
