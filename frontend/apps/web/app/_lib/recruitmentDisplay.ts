import { daysUntilKst, parseKstInstant } from '@duing/hooks/datetime';
import type { ApplicationMode, RecruitmentDisplayStatus, RecruitmentSummary } from '@duing/types';

export function displayStatusLabel(status: RecruitmentDisplayStatus): string {
  switch (status) {
    case 'UPCOMING':
      return '모집예정';
    case 'OPEN':
      return '모집중';
    case 'ALWAYS_OPEN':
      return '상시모집';
    case 'CLOSED':
      return '모집마감';
  }
}

export function recruitmentPeriodLabel(
  startDate: string,
  endDate: string | null,
): string {
  if (endDate === null) {
    return '상시모집';
  }
  return `${startDate} ~ ${endDate}`;
}

/**
 * 마감일이 지났지만 아직 수동 마감 전인 구간(raw OPEN + displayStatus CLOSED).
 *
 * 백엔드는 이 구간을 여전히 OPEN(심사 진행 중)으로 다루므로 마감·수정 같은 액션 게이트는 raw status 를
 * 따른다. 이 판정은 그 구간을 '마감'으로 잘못 표기하지 않기 위한 표시용이다 — 캠페인 기간 표기
 * (D-day·상태 칩 색)는 그대로 displayStatus 를 쓴다.
 */
export function isRecruitmentUnderReview(
  recruitment: Pick<RecruitmentSummary, 'status' | 'displayStatus'>,
): boolean {
  return recruitment.status === 'OPEN' && recruitment.displayStatus === 'CLOSED';
}

/** 만료-OPEN 상태 칩 — 모집이 아직 열려 있으므로 '마감'이라고 단정하지 않는다. */
export const RECRUITMENT_UNDER_REVIEW_LABEL = '기간 종료';

/** 만료-OPEN 안내 문구 — 지금 상태와 다음 행동(심사·가입 처리 후 마감)을 함께 알려준다. */
export function recruitmentUnderReviewNotice(applicationMode: ApplicationMode): string {
  return applicationMode === 'EXTERNAL'
    ? '모집 기간이 끝났지만 아직 마감 전이에요. 가입 처리를 마치면 모집을 마감해 주세요.'
    : '모집 기간이 끝났지만 아직 마감 전이에요. 남은 지원자 심사를 이어서 진행하고, 심사를 마치면 모집을 마감해 주세요.';
}

/** KST 캘린더 기준 마감까지 남은 일수. endDate 가 null 이거나 파싱 불가면 null. */
export function recruitmentDaysLeft(
  endDate: string | null,
  today: Date = new Date(),
): number | null {
  if (endDate === null) {
    return null;
  }
  if (Number.isNaN(parseKstInstant(endDate).getTime())) {
    return null;
  }
  return daysUntilKst(endDate, today);
}
