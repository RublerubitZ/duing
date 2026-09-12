import { CLOSING_SOON_DAYS } from '@duing/hooks/datetime';
import type { ClubSummary } from '@duing/types';

import { ddayLabel } from './dday';
import { recruitmentDaysLeft } from './recruitmentDisplay';

/** 마감 임박 노출 윈도우 — 마감 D-7 부터 D-Day 까지만 노출(D-8 이상·마감 완료·상시모집 제외). */
export const CLOSING_SOON_WINDOW_DAYS = 7;

export type ClosingSoonEmphasis = 'danger' | 'warning' | 'default';

// 시안(509:7790)의 칩은 밝은 회색 면(Gray/004 #E1E1E1) 위 딥그린 글자 하나뿐이라, 긴급도는 면 색으로만 가른다.
// 글자는 셋 다 딥그린 — warm 7.8:1, coral 4.5:1 로 셋 다 AA 를 넘고, 기존 반투명 칩(3.5:1)보다 대비가 높다.
// 티커(마퀴)와 홈 모집 요약 타일이 같은 칩을 쓰므로 선별 로직 옆에 둔다 — 한쪽만 바뀌면 같은 D-day 가 두 색이 된다.
export const CLOSING_SOON_CHIP_CLASS: Record<ClosingSoonEmphasis, string> = {
  danger: 'bg-coral',
  warning: 'bg-warm',
  default: 'bg-[#E1E1E1]',
};

export type ClosingSoonItem = {
  id: number;
  name: string;
  daysLeft: number;
  label: string;
  emphasis: ClosingSoonEmphasis;
};

/** 강조 규칙: D-day·D-1 = 위험(danger), 마감임박 임계(D-3) 이내 = 경고(warning), 그 밖은 기본(default). */
export function closingSoonEmphasis(daysLeft: number): ClosingSoonEmphasis {
  if (daysLeft <= 1) return 'danger';
  if (daysLeft <= CLOSING_SOON_DAYS) return 'warning';
  return 'default';
}

/**
 * 모집중 동아리 목록에서 마감 D-7 ~ D-Day 인 항목만 골라 티커 배지용 데이터로 변환한다.
 * 상시모집(endDate=null), 마감 완료(D+N), D-8 이상은 제외하며, 입력 정렬(마감 임박순)은 보존한다.
 */
export function selectClosingSoonClubs(clubs: ClubSummary[], today: Date): ClosingSoonItem[] {
  const items: ClosingSoonItem[] = [];
  for (const club of clubs) {
    const daysLeft = recruitmentDaysLeft(club.activeRecruitment?.endDate ?? null, today);
    if (daysLeft === null || daysLeft < 0 || daysLeft > CLOSING_SOON_WINDOW_DAYS) {
      continue;
    }
    items.push({
      id: club.id,
      name: club.name,
      daysLeft,
      label: ddayLabel(daysLeft),
      emphasis: closingSoonEmphasis(daysLeft),
    });
  }
  return items;
}
