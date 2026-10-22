import { COLLEGE_DISPLAY_NAME, isCollege } from '@duing/types';
import type { AdminJoinLinkStatus, ApplicationMode } from '@duing/types';

import { externalFormPlatformLabel } from '@/app/manage/clubs/[clubId]/recruitments/_lib/externalFormPlatform';

export const JOIN_LINK_STATUS_LABEL: Record<AdminJoinLinkStatus['linkStatus'], string> = {
  ACTIVE: '활성',
  EXPIRED: '만료',
  EXHAUSTED: '소진',
};

/**
 * 지원 상태 뱃지 색은 공용 상수 하나로 모았다 — 같은 상태가 화면마다 다른 색이면 안 된다.
 * (이전에는 보류만 운영진 콘솔에 맞춘 예외로 남아 있었다.)
 */
export { APPLICATION_STATUS_BADGE_CLASS } from '@/app/_constants/application-status';

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
