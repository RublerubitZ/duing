import { COLLEGE_DISPLAY_NAME, isCollege } from '@duing/types';
import type {
  AdminJoinLinkStatus,
  ApplicationMode,
  ApplicationStatus,
  RecruitmentDisplayStatus,
  RecruitmentStatus,
} from '@duing/types';

import { isRecruitmentExpiredOpen, recruitmentStatusChip } from '@/app/_lib/recruitmentDisplay';
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

/**
 * 총동연 콘솔의 모집 상태 칩. 운영진 콘솔과 같은 헬퍼(`recruitmentStatusChip`)를 써서 어휘·색·
 * 만료-OPEN 판정을 공유한다 — 같은 모집이 화면마다 다른 이름으로 불리던 것을 없앤다(#896).
 *
 * <p>배포 전환기에 표시 상태가 없는 구 응답이 오면 지금까지처럼 저장 상태로 적는다. 알려진 값이
 * 왔을 때만 새 표기로 갈아타는 fail-open 이라, 서버가 먼저 올라가든 나중에 올라가든 칩이 비지 않는다.
 * 백엔드가 배포된 뒤에는 도달할 수 없는 분기이므로 다음 정리 때 지워도 된다.
 */
export function recruitmentConsoleChip(recruitment: {
  status: RecruitmentStatus;
  displayStatus?: RecruitmentDisplayStatus;
}): { label: string; badgeClass: string } {
  const displayStatus = recruitment.displayStatus;
  if (displayStatus === undefined) {
    return {
      label: RECRUITMENT_STATUS_LABEL[recruitment.status],
      badgeClass: RECRUITMENT_STATUS_BADGE_CLASS[recruitment.status],
    };
  }
  return recruitmentStatusChip({ status: recruitment.status, displayStatus });
}

/**
 * 기간이 끝났는데 아직 열려 있는 모집 — 학생에게는 지원할 수 있는 것처럼 보이므로 운영이 손을 대야 한다.
 * 판정은 `isRecruitmentExpiredOpen` 하나만 쓴다(#896 통합). 예전에는 목록 응답에 표시 상태가 없어
 * endDate 로 직접 계산했고, 그래서 클라이언트 시계가 어긋나면 운영진 화면과 판정이 갈렸다.
 * 강제 마감 가능 여부는 여전히 서버 상태(status === 'OPEN')만 본다.
 *
 * <p>표시 상태가 없는 구 응답에서는 판정을 보류한다 — 근거 없이 "개입 필요"를 띄우지 않는다.
 */
export function needsOperatorAttention(recruitment: {
  status: RecruitmentStatus;
  displayStatus?: RecruitmentDisplayStatus;
}): boolean {
  const displayStatus = recruitment.displayStatus;
  return displayStatus !== undefined
    && isRecruitmentExpiredOpen({ status: recruitment.status, displayStatus });
}
