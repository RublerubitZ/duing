import type {
  AdminJoinLinkStatus,
  AdminRecruitmentSummary,
  ApplicationMode,
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
