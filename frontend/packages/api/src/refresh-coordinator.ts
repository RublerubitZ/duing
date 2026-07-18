import { getStorage } from '@duing/storage';

/**
 * 웹 refresh 갱신 조율 (스펙 §12) — 3중 방어의 FE 1·2층.
 * 1층: 크로스탭 뮤텍스 어댑터(미등록 환경은 탭 내 in-flight 공유 폴백).
 * 2층: storage 최근 갱신 시각 — 락 획득 후 다른 탭이 방금(10초) 갱신했으면 실행 생략.
 * (3층 BE grace window 는 여기를 뚫는 잔여 경합의 안전망이다.)
 * 쿠키는 탭 간 공유 저장소라, 어느 탭이 갱신했든 재시도만 하면 새 쿠키를 쓴다.
 *
 * packages/* 는 DOM API(navigator.locks) 를 직접 참조하지 않는다 — 크로스탭 락은
 * 앱 계층이 registerRefreshLockAdapter 로 주입한다(connectivity 어댑터와 동형).
 */
const LAST_REFRESH_STORAGE_KEY = 'duing:auth:web-refreshed-at';
const RECENT_REFRESH_SKIP_MS = 10_000;

export type RefreshOutcome = 'refreshed' | 'skipped' | 'session-expired' | 'unavailable';

export type RefreshCoordinator = {
  ensureFreshSession(): Promise<RefreshOutcome>;
};

// 크로스탭 직렬화 락 어댑터. 미등록이면 탭 내 in-flight 공유만으로 동작한다(락 없이 즉시 실행).
export type RefreshLockAdapter = <T>(task: () => Promise<T>) => Promise<T>;

let refreshLockAdapter: RefreshLockAdapter | null = null;

export function registerRefreshLockAdapter(adapter: RefreshLockAdapter | null): void {
  refreshLockAdapter = adapter;
}

export function createRefreshCoordinator(
  executeRefresh: () => Promise<RefreshOutcome>,
): RefreshCoordinator {
  let inFlight: Promise<RefreshOutcome> | null = null;

  async function refreshUnderLock(): Promise<RefreshOutcome> {
    if (await wasRefreshedRecently()) {
      return 'skipped';
    }
    const outcome = await executeRefresh();
    if (outcome === 'refreshed') {
      await markRefreshedNow();
    }
    return outcome;
  }

  async function withCrossTabLock(task: () => Promise<RefreshOutcome>): Promise<RefreshOutcome> {
    if (refreshLockAdapter) {
      // 어댑터의 Awaited 언랩으로 단언 없이 RefreshOutcome 으로 좁힌다.
      return await refreshLockAdapter(task);
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

async function wasRefreshedRecently(): Promise<boolean> {
  try {
    const raw = await getStorage().getItem(LAST_REFRESH_STORAGE_KEY);
    if (raw === null) return false;
    const refreshedAt = Number(raw);
    if (!Number.isFinite(refreshedAt)) return false;
    // 미래 타임스탬프(시계 역행·조작)는 elapsed<0 이라 '방금 갱신' 으로 오판하지 않는다.
    const elapsed = Date.now() - refreshedAt;
    return elapsed >= 0 && elapsed < RECENT_REFRESH_SKIP_MS;
  } catch {
    return false; // storage 접근 불가(SSR·프라이빗 모드 등) — 생략 최적화만 포기
  }
}

async function markRefreshedNow(): Promise<void> {
  try {
    await getStorage().setItem(LAST_REFRESH_STORAGE_KEY, String(Date.now()));
  } catch {
    // 기록 실패는 무해 — 다음 탭이 한 번 더 갱신할 뿐(BE grace 가 흡수)
  }
}
