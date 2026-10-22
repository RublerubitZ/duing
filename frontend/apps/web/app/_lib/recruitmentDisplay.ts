import { daysUntilKst, parseKstInstant } from '@duing/hooks/datetime';
import type { ApplicationMode, RecruitmentDisplayStatus, RecruitmentSummary } from '@duing/types';

/** 학생 화면 상태 라벨 — 아래 표시 상태 테이블을 그대로 읽는다(운영진·총동연 칩과 같은 출처). */
export function displayStatusLabel(status: RecruitmentDisplayStatus): string {
  return RECRUITMENT_DISPLAY_STATUS_LABEL[displayStatusOrClosed(status)];
}

/**
 * 백엔드가 먼저 배포한 모르는 표시 상태는 마감의 라벨·색으로 읽는다 — 빈 칩을 그리지 않고, 지원할 수 있다고
 * 잘못 말하지도 않는다(지원 바와 같은 폴백). 라벨·색을 꺼낼 때만 쓴다 — 액션 게이트와 만료-OPEN 판정은 원래 값을 본다.
 */
function displayStatusOrClosed(status: RecruitmentDisplayStatus): RecruitmentDisplayStatus {
  return Object.hasOwn(RECRUITMENT_DISPLAY_STATUS_LABEL, status) ? status : 'CLOSED';
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
 * 총동연 콘솔(목록의 "운영 개입 필요"·상태 칩)도 이 함수를 그대로 쓴다(#896). 예전에는 총동연 목록 응답에
 * displayStatus 가 없어 endDate 로 직접 계산했고, 클라이언트 시계가 어긋나면 두 화면의 판정이 갈렸다.
 * 세 번째 술어를 만들지 말 것.
 */
export function isRecruitmentExpiredOpen(
  recruitment: Pick<RecruitmentSummary, 'status' | 'displayStatus'>,
): boolean {
  return recruitment.status === 'OPEN' && recruitment.displayStatus === 'CLOSED';
}

/** 만료-OPEN 상태 칩 라벨 — 모집이 아직 열려 있으므로 '마감'이라고 단정하지 않는다. */
export const RECRUITMENT_EXPIRED_OPEN_LABEL = '기간 종료';

/**
 * 만료-OPEN 칩 색. displayStatus 는 CLOSED 지만 모집은 아직 열려 있어 마감(outline)과 구분하고,
 * 운영진의 처리가 남았음을 알리도록 warm 변형(테두리)으로 예정과 구분한다.
 */
export const RECRUITMENT_EXPIRED_OPEN_BADGE = 'pill pill-warm-outline';

// 백엔드 자동 마감 유예(RecruitmentAutoClosePolicy.GRACE_DAYS)와 같은 값이다 — 바뀌면 함께 고친다.
const AUTO_CLOSE_GRACE_DAYS = 7;

/**
 * 만료-OPEN 안내 문구 — 지금 상태와 다음 행동(심사·가입 처리 후 마감), 그리고 그대로 두면 종료일로부터
 * {@link AUTO_CLOSE_GRACE_DAYS}일이 지나 자동 마감된다는 사실을 함께 알려준다.
 */
export function recruitmentExpiredOpenNotice(applicationMode: ApplicationMode): string {
  const nextStep =
    applicationMode === 'EXTERNAL'
      ? '가입 처리를 마치면 모집을 마감해 주세요.'
      : '남은 지원자 심사를 이어서 진행하고, 심사를 마치면 모집을 마감해 주세요.';
  // 자체 지원은 결과 없는 지원·진행 중 면접 라운드가 있으면 자동 마감되지 않는다. 외부 폼은 둘 다 없어 조건 없이 닫힌다.
  const autoClose =
    applicationMode === 'EXTERNAL'
      ? `종료일로부터 ${AUTO_CLOSE_GRACE_DAYS}일이 지나면 자동으로 마감돼요.`
      : `남은 심사·면접이 없으면 종료일로부터 ${AUTO_CLOSE_GRACE_DAYS}일이 지난 뒤 자동으로 마감돼요.`;
  return `모집 기간이 끝났지만 아직 마감 전이에요. ${nextStep} ${autoClose}`;
}

/**
 * 모집 표시 상태 라벨의 단일 출처 — 학생 화면·운영진·총동연 칩이 모두 이 값을 읽는다. 화면에 리터럴 사본을
 * 두지 말 것. 만료-OPEN 은 운영진·총동연 칩만 '기간 종료'로 덮는다(`recruitmentStatusChip`).
 */
export const RECRUITMENT_DISPLAY_STATUS_LABEL: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: '모집예정',
  OPEN: '모집중',
  ALWAYS_OPEN: '상시모집',
  CLOSED: '모집마감',
};

export const RECRUITMENT_DISPLAY_STATUS_BADGE: Record<RecruitmentDisplayStatus, string> = {
  UPCOMING: 'pill pill-warm',
  OPEN: 'pill',
  ALWAYS_OPEN: 'pill pill-sky',
  CLOSED: 'pill pill-outline',
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
  const displayStatus = displayStatusOrClosed(recruitment.displayStatus);
  return {
    label: RECRUITMENT_DISPLAY_STATUS_LABEL[displayStatus],
    badgeClass: RECRUITMENT_DISPLAY_STATUS_BADGE[displayStatus],
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
