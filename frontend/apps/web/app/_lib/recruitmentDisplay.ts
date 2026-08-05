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
 *
 * 총동연 콘솔의 `needsOperatorAttention`(app/admin/recruitments/_lib/recruitmentLabels)이 같은 도메인
 * 상태를 다른 이름·라벨로 표현한다. 목록 응답(AdminRecruitmentSummary)에 displayStatus 가 없어 그쪽은
 * endDate 로 직접 계산하므로, 클라이언트 시계가 어긋나면 두 화면의 판정이 갈릴 수 있다(#896 에서 통합).
 * 세 번째 술어를 만들지 말고 둘 중 하나를 쓴다.
 */
export function isRecruitmentExpiredOpen(
  recruitment: Pick<RecruitmentSummary, 'status' | 'displayStatus'>,
): boolean {
  return recruitment.status === 'OPEN' && recruitment.displayStatus === 'CLOSED';
}

/** 만료-OPEN 상태 칩 라벨 — 모집이 아직 열려 있으므로 '마감'이라고 단정하지 않는다. */
export const RECRUITMENT_EXPIRED_OPEN_LABEL = '기간 종료';

/**
 * 만료-OPEN 칩 색. displayStatus 는 CLOSED 지만 모집은 아직 열려 있어 마감(slate)과 구분하고,
 * 운영진의 처리가 남았음을 알리는 주의색을 쓴다.
 */
export const RECRUITMENT_EXPIRED_OPEN_BADGE = 'bg-amber-100 text-amber-700';

/** 만료-OPEN 안내 문구 — 지금 상태와 다음 행동(심사·가입 처리 후 마감)을 함께 알려준다. */
export function recruitmentExpiredOpenNotice(applicationMode: ApplicationMode): string {
  const nextStep =
    applicationMode === 'EXTERNAL'
      ? '가입 처리를 마치면 모집을 마감해 주세요.'
      : '남은 지원자 심사를 이어서 진행하고, 심사를 마치면 모집을 마감해 주세요.';
  return `모집 기간이 끝났지만 아직 마감 전이에요. ${nextStep}`;
}

export const RECRUITMENT_DISPLAY_STATUS_LABEL: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: '예정',
  OPEN: '모집중',
  ALWAYS_OPEN: '상시모집',
  CLOSED: '마감',
};

export const RECRUITMENT_DISPLAY_STATUS_BADGE: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: 'bg-amber-100 text-amber-700',
  OPEN: 'bg-emerald-100 text-emerald-700',
  ALWAYS_OPEN: 'bg-sky-100 text-sky-700',
  CLOSED: 'bg-slate-100 text-slate-600',
};

/**
 * 운영진 화면 상태 칩의 라벨과 색. 둘은 항상 같이 갈리므로 한 번에 돌려준다 — 호출부가 같은 조건을
 * 두 번 쓰다 한쪽만 바뀌는 것을 막는다.
 */
export function recruitmentStatusChip(
  recruitment: Pick<RecruitmentSummary, 'status' | 'displayStatus'>,
): { label: string; badgeClass: string } {
  if (isRecruitmentExpiredOpen(recruitment)) {
    return { label: RECRUITMENT_EXPIRED_OPEN_LABEL, badgeClass: RECRUITMENT_EXPIRED_OPEN_BADGE };
  }
  return {
    label: RECRUITMENT_DISPLAY_STATUS_LABEL[recruitment.displayStatus],
    badgeClass: RECRUITMENT_DISPLAY_STATUS_BADGE[recruitment.displayStatus],
  };
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
