import type { ApplicationMode, StatsSummary } from '@duing/types';

import { recruitmentExpiredOpenNotice } from '@/app/_lib/recruitmentDisplay';

/** 통계 요약 조회 결과 중 안내 문장을 고르는 데 쓰는 값 — 진행 중 모집 카드와 모집 상세가 같은 판정을 쓴다. */
type StatsSummaryQueryState = {
  data: StatsSummary | undefined;
  isPending: boolean;
  isFetching: boolean;
  isStale: boolean;
  isError: boolean;
};

/**
 * 기간 종료(만료-OPEN) 안내의 완성 문장(#1572). 아직 보일 문장이 없으면 null 이다 — 화면은 첫 문장만 낭독 없이 보이고
 * 자리를 잡아 둔다(늦게 끼어들어 페이지를 밀지 않게).
 *
 * 안내는 낭독 영역이라 문장이 바뀌면 다시 읽힌다. 그래서 요약을 처음 받거나 오래된·무효화된 캐시를 다시 받는 동안에는
 * 완성 문장을 내지 않고, 받으면 한 번 채운다. 받기가 실패하면 남은 옛 전망 대신 지원 방식만 본 고정 문장을 쓴다.
 */
export function expiredOpenNoticeText(
  applicationMode: ApplicationMode,
  statsSummaryQuery: StatsSummaryQueryState,
): string | null {
  if (statsSummaryQuery.isPending || (statsSummaryQuery.isFetching && statsSummaryQuery.isStale)) {
    return null;
  }
  return recruitmentExpiredOpenNotice(
    applicationMode,
    statsSummaryQuery.isError ? undefined : statsSummaryQuery.data?.autoClose,
  );
}
