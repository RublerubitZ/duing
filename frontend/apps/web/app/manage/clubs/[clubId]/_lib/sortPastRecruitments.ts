import { kstDateString, parseKstInstant } from '@duing/hooks/datetime';
import type { RecruitmentSummary } from '@duing/types';

/**
 * closedAt(Instant `…Z`)의 KST 날짜부. 값이 없거나 파싱 불가면 null.
 * 문자열 slice 는 UTC 날짜라 KST 자정 부근(00:00~09:00)에 하루 어긋난다 — 반드시 KST 변환을 거친다.
 * closedAt 미노출 백엔드(배포 전환기·구 캐시 응답)에서는 undefined 로 들어오므로 함께 흡수한다.
 */
export function recruitmentClosedDateKst(closedAt: string | null | undefined): string | null {
  if (closedAt === undefined || closedAt === null) return null;
  if (Number.isNaN(parseKstInstant(closedAt).getTime())) return null;
  return kstDateString(closedAt);
}

/**
 * 마감 아카이브의 종료 시점 키(KST `YYYY-MM-DD`) — 정렬과 마감일 표기가 함께 쓴다.
 *
 * closedAt 은 실제 종료가 아니라 마감이 스탬프된 시점이다. 마감일이 지난 모집이 수개월 뒤
 * 신규 모집 등록 시점에 lazy 마감되면 스탬프가 실제 종료보다 늦으므로,
 * 기간 모집은 `min(closedAt 의 KST 날짜, endDate)`, 상시모집은 closedAt, 레거시는 startDate 로 잡는다.
 */
export function recruitmentClosedSortKey(recruitment: RecruitmentSummary): string {
  const closedDate = recruitmentClosedDateKst(recruitment.closedAt);
  if (recruitment.endDate !== null) {
    if (closedDate !== null && closedDate < recruitment.endDate) return closedDate; // 조기 마감
    return recruitment.endDate;
  }
  return closedDate ?? recruitment.startDate;
}

/**
 * 아카이브 표기용 마감일 라벨. 실제로 마감된 건만 종료 시점을 표기한다 —
 * 마감일이 지났을 뿐인 심사 중 모집에 마감일을 붙이지 않는다. 표기 문구는 아카이브 표면
 * (모집 관리 표·지원현황 진입)이 공유하므로 여기서 한 번만 정의한다.
 */
export function recruitmentClosedLabel(recruitment: RecruitmentSummary): string | null {
  if (recruitmentClosedDateKst(recruitment.closedAt) === null) return null;
  return `마감 ${recruitmentClosedSortKey(recruitment)}`;
}

/** 지난 모집을 종료 시점 내림차순(최신 우선)으로. 원본은 그대로 두고 사본을 정렬한다. */
export function sortPastRecruitments(recruitments: RecruitmentSummary[]): RecruitmentSummary[] {
  return [...recruitments].sort((left, right) => {
    const leftKey = recruitmentClosedSortKey(left);
    const rightKey = recruitmentClosedSortKey(right);
    if (leftKey === rightKey) return 0;
    return leftKey < rightKey ? 1 : -1;
  });
}
