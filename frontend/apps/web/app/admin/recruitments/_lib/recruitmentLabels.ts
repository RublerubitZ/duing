import { COLLEGE_DISPLAY_NAME, isCollege } from '@duing/types';
import type {
  AdminJoinLinkStatus,
  AdminRecruitmentSummary,
  ApplicationMode,
  ApplicationStatus,
  RecruitmentStatus,
} from '@duing/types';

import { recruitmentDaysLeft } from '@/app/_lib/recruitmentDisplay';
import { externalFormPlatformLabel } from '@/app/manage/clubs/[clubId]/recruitments/_lib/externalFormPlatform';

export const RECRUITMENT_STATUS_LABEL: Record<RecruitmentStatus, string> = {
  OPEN: '모집중',
  CLOSED: '마감',
};

export const RECRUITMENT_STATUS_BADGE_CLASS: Record<RecruitmentStatus, string> = {
  OPEN: 'bg-sage/10 text-ink',
  CLOSED: 'bg-graysoft text-charcoal-2',
};

export const JOIN_LINK_STATUS_LABEL: Record<AdminJoinLinkStatus['linkStatus'], string> = {
  ACTIVE: '활성',
  EXPIRED: '만료',
  EXHAUSTED: '소진',
};

/**
 * 지원 상태 뱃지 색. 라벨은 공용 상수(APPLICATION_STATUS_LABEL)를 쓰고 여기서는 색만 정한다.
 * Record 라 상태 집합이 바뀌면 타입 검사에서 곧바로 걸린다 — 조용히 색이 빠지지 않는다.
 */
export const APPLICATION_STATUS_BADGE_CLASS: Record<ApplicationStatus, string> = {
  SUBMITTED: 'bg-graysoft text-charcoal-2',
  // 보류 색은 운영진 콘솔(manage ApplicantTable) 과 맞춘다 — 같은 상태가 화면마다 다른 색이면 안 된다.
  ON_HOLD: 'bg-amber-100 text-amber-700',
  INTERVIEW_PENDING: 'bg-sage/10 text-ink',
  ACCEPTED: 'bg-sage/20 text-ink-deep',
  REJECTED: 'bg-danger/10 text-danger',
};

/**
 * 단과대·학과 한 줄 표기. 단과대는 서버 enum 이라 표시명으로 옮기되, 아직 모르는 값이 오면
 * 빈칸으로 지우지 않고 원문을 그대로 보여준다(회원 관리 화면과 같은 fail-open 규칙).
 */
export function collegeMajorLabel(college: string, major: string): string {
  const collegeLabel = isCollege(college) ? COLLEGE_DISPLAY_NAME[college] : college;
  return [collegeLabel, major].filter(Boolean).join(' · ') || '—';
}

/**
 * 지원 방식 표기. 외부 폼은 플랫폼을 알 수 있으면 그 이름으로 부른다 — 운영자가 어디로 지원이
 * 들어가는지 한눈에 보게 한다. 목록 응답에는 URL 이 없어(상세에만 있다) 일반 라벨로 떨어진다.
 */
export function applicationModeLabel(
  applicationMode: ApplicationMode,
  externalFormUrl: string | null,
): string {
  if (applicationMode === 'SELF') return '자체 지원';
  return externalFormPlatformLabel(externalFormUrl) ?? '외부 폼';
}

/**
 * 기간이 끝났는데 아직 열려 있는 모집 — 학생에게는 지원할 수 있는 것처럼 보이므로 운영이 손을 대야 한다.
 * 화면 표시용 파생 값일 뿐이며, 강제 마감 가능 여부는 서버 상태(status === 'OPEN')만 본다.
 */
export function needsOperatorAttention(
  recruitment: Pick<AdminRecruitmentSummary, 'status' | 'endDate'>,
  today: Date = new Date(),
): boolean {
  if (recruitment.status !== 'OPEN' || recruitment.endDate === null) return false;
  const daysLeft = recruitmentDaysLeft(recruitment.endDate, today);
  return daysLeft !== null && daysLeft < 0;
}
