/**
 * 웹 refresh 갱신 조율 (스펙 §12) — 3중 방어의 FE 1·2층.
 * 1층: navigator.locks 크로스탭 뮤텍스(미지원 환경은 탭 내 in-flight 공유 폴백).
 * 2층: localStorage 최근 갱신 시각 — 락 획득 후 다른 탭이 방금(10초) 갱신했으면 실행 생략.
 * (3층 BE grace window 는 여기를 뚫는 잔여 경합의 안전망이다.)
 * 쿠키는 탭 간 공유 저장소라, 어느 탭이 갱신했든 재시도만 하면 새 쿠키를 쓴다.
 */
const LAST_REFRESH_STORAGE_KEY = 'duing:auth:web-refreshed-at';
const RECENT_REFRESH_SKIP_MS = 10_000;
const CROSS_TAB_LOCK_NAME = 'duing-auth:refresh';

export type RefreshOutcome = 'refreshed' | 'skipped' | 'session-expired' | 'unavailable';

export type RefreshCoordinator = {
  ensureFreshSession(): Promise<RefreshOutcome>;
};

export function createRefreshCoordinator(
  executeRefresh: () => Promise<RefreshOutcome>,
): RefreshCoordinator {
  let inFlight: Promise<RefreshOutcome> | null = null;

  async function refreshUnderLock(): Promise<RefreshOutcome> {
    if (wasRefreshedRecently()) {
      return 'skipped';
    }
    const outcome = await executeRefresh();
    if (outcome === 'refreshed') {
      markRefreshedNow();
    }
    return outcome;
  }

  async function withCrossTabLock(task: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      // DOM 타입상 request<T> 콜백은 T 를 반환한다고만 보여, async 콜백이면
      // Promise<Promise<RefreshOutcome>> 로 잡힌다(런타임에선 자동 평탄화).
      // await 의 Awaited 언랩으로 단언 없이 RefreshOutcome 으로 좁힌다.
      return await locks.request(CROSS_TAB_LOCK_NAME, task);
    }
    return task();
  }

  return {
    ensureFreshSession() {
      if (inFlight === null) {
        inFlight = withCrossTabLock(refreshUnderLock).finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  };
}

function wasRefreshedRecently(): boolean {
  try {
    const raw = globalThis.localStorage?.getItem(LAST_REFRESH_STORAGE_KEY);
    if (raw === null || raw === undefined) return false;
    const refreshedAt = Number(raw);
    return Number.isFinite(refreshedAt) && Date.now() - refreshedAt < RECENT_REFRESH_SKIP_MS;
  } catch {
    return false; // localStorage 접근 불가(프라이빗 모드 등) — 생략 최적화만 포기
  }
}

function markRefreshedNow(): void {
  try {
    globalThis.localStorage?.setItem(LAST_REFRESH_STORAGE_KEY, String(Date.now()));
  } catch {
    // 기록 실패는 무해 — 다음 탭이 한 번 더 갱신할 뿐(BE grace 가 흡수)
  }
}
