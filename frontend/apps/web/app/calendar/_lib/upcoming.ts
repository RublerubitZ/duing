import { addDaysIso } from '@duing/hooks';

import type { CalEvent, EventKind } from '../_types';

/** Upcoming 조회 창 — 오늘부터 30일(양끝 포함). 14일은 현재 데이터 밀도에서 빈 상태가 잦다. */
export const UPCOMING_WINDOW_DAYS = 30;
export const UPCOMING_LIMIT = 6;

/**
 * 창·필터·중복 제거·정렬·limit 만 담당한다(표시 포맷은 toUpcomingView).
 *
 * @param events 창이 걸치는 달들을 병합한 이벤트. 훅이 월 단위로 조회하므로 창 밖 날짜가 섞여 온다.
 * @param todayIso 로컬 오늘 "YYYY-MM-DD"
 * @param activeKinds 필터 칩 상태 — 메인 캘린더와 동기, 달(View)과는 무관하다.
 *   predicate 대신 Set 을 받는 이유: 호출부 상태가 그대로 Set 이라 변환이 없고,
 *   인라인 화살표(predicate)는 매 렌더 새 참조라 소비처의 useMemo 를 조용히 무력화한다.
 */
export type UpcomingEmptyState = 'hidden' | 'no-events' | 'filtered-out';

/**
 * 빈 상태 문구를 결정한다.
 *
 * <p>세 가지를 구분해야 한다 — ① 아직 로딩 중(문구 없음) ② 필터 때문에 비었음 ③ 진짜 없음.
 * ②를 "필터가 일부 꺼져 있음" 으로 판정하면, 원래 0건인데 칩 하나만 꺼도 "필터를 켜면 볼 수 있어요"
 * 라는 거짓 안내가 나간다. 필터를 모두 켠 결과와 비교해야 정확하다.
 *
 * @param isLoading 창의 어느 달이든 로딩 중이거나 **인증 판정이 끝나지 않았으면** true.
 *   동아리 일정 쿼리는 인증 확정 후에야 시작하므로, meQuery 로딩을 빼면 로그인 사용자에게
 *   "일정이 없어요" 가 잠깐 떴다가 목록으로 바뀐다.
 */
export function resolveUpcomingEmptyState(params: {
  visibleCount: number;
  unfilteredCount: number;
  isLoading: boolean;
}): UpcomingEmptyState {
  if (params.visibleCount > 0 || params.isLoading) return 'hidden';
  return params.unfilteredCount > 0 ? 'filtered-out' : 'no-events';
}

export function buildUpcoming(
  events: CalEvent[],
  todayIso: string,
  activeKinds: Set<EventKind>,
): CalEvent[] {
  const windowEnd = addDaysIso(todayIso, UPCOMING_WINDOW_DAYS);
  // 다일 이벤트는 날짜별로 fan-out 되어 있으므로 원본(sourceType-sourceId) 단위로 접는다.
  const originals = new Map<string, CalEvent>();
  for (const event of events) {
    if (!activeKinds.has(event.kind)) continue;
    if (event.date < todayIso || event.date > windowEnd) continue;
    const key = `${event.sourceType}-${event.sourceId}`;
    const existing = originals.get(key);
    if (!existing || event.date < existing.date) originals.set(key, event);
  }
  return Array.from(originals.values())
    .sort(
      (first, second) =>
        first.date.localeCompare(second.date) || first.time.localeCompare(second.time),
    )
    .slice(0, UPCOMING_LIMIT);
}
