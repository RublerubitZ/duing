// 라운드 멤버 상태 뱃지 라벨·스타일 — RoundMemberTable(roundMemberBadge)·ConfirmRoundDialog 공용.
// 결과 판정(isDecidedApplicationResult)은 표의 결과 배지, 표·가능없음 섹션의 배정 동작 숨김, 확정 409 창의 빈 자리 표시 숨김이 함께 쓴다.
// 알 수 없는 상태값은 원문을 그대로 보인다 — 표는 roundMemberBadge 안에서, 확정 409 창은 호출부의 `?? fallback` 으로.

import type { InterviewRoundDetailMember } from '@duing/types';
import {
  APPLICATION_STATUS_OPERATOR_LABEL,
  isTerminalApplicationStatus,
  type TerminalApplicationStatus,
} from '@/app/_constants/application-status';

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  INVITED: '초대됨',
  RESPONDED: '응답 완료',
  NO_AVAILABLE_SLOT: '가능없음',
  ASSIGNED: '배정됨',
  EXCLUDED: '제외됨',
};

export const MEMBER_STATUS_CLASS: Record<string, string> = {
  INVITED: 'bg-paper text-charcoal-2 ring-1 ring-inset ring-line',
  RESPONDED: 'bg-sage/10 text-sage-deep',
  NO_AVAILABLE_SLOT: 'bg-warm/10 text-warm-deep',
  ASSIGNED: 'bg-sky/10 text-sky-deep',
  EXCLUDED: 'bg-coral/10 text-coral-deep',
};

/**
 * 결과를 정해 라운드에서 빠진 멤버의 배지 — 콘솔 상태 배지 규약(DESIGN.md): 합격 = 긍정, 불합격 = 중립(종료).
 * 불합격을 코랄로 칠하지 않는 것은 의도다 — 운영진이 뺀 '제외됨'(코랄)과 갈라야 하고, 지원자 목록의 pill-coral 은 콘솔 규약 밖이다.
 */
const DECIDED_RESULT_CLASS: Record<TerminalApplicationStatus, string> = {
  ACCEPTED: 'bg-sage/10 text-sage-deep',
  REJECTED: 'bg-paper text-charcoal-2 ring-1 ring-inset ring-line',
};

/** 결과를 정한 멤버의 배정 동작 자리에 적는 이유 — 숨긴 버튼 이름을 받아 단계마다 무엇이 막혔는지 말한다(표·가능없음 섹션 공용) */
export const RESULT_DECIDED_MANUAL_ASSIGN_NOTE = '결과 확정 — 수동 배정 불가';
export const RESULT_DECIDED_RESCHEDULE_NOTE = '결과 확정 — 일정 변경 불가';

/**
 * 지원 결과가 알려진 결과(합격·불합격)인가. 필드가 없는 옛 백엔드(undefined)·null·모르는 값은 아니다(fail-open — 지금 표시·버튼 그대로).
 */
export function isDecidedApplicationResult(
  applicationResult: InterviewRoundDetailMember['applicationResult'],
): applicationResult is TerminalApplicationStatus {
  return applicationResult != null && isTerminalApplicationStatus(applicationResult);
}

/**
 * 라운드 표의 멤버 배지. EXCLUDED 이면서 지원 결과가 아는 값(합격·불합격)이면 '제외됨' 대신 그 결과를 보인다 — 결과로 빠진 사람이
 * 운영진이 뺀 사람(빨간 '제외됨')과 같아 보이지 않게 하고, 운영진이 먼저 뺀 뒤 결과가 난 사람도 지금 결과로 보인다.
 * 확정 라운드의 ASSIGNED·진행 중 멤버에 결과가 실려도, 필드가 없는 옛 백엔드도, 모르는 값도 지금 멤버 상태 그대로다.
 */
export function roundMemberBadge(member: Pick<InterviewRoundDetailMember, 'status' | 'applicationResult'>): {
  label: string;
  className: string;
} {
  const { applicationResult } = member;
  if (member.status === 'EXCLUDED' && isDecidedApplicationResult(applicationResult)) {
    return { label: APPLICATION_STATUS_OPERATOR_LABEL[applicationResult], className: DECIDED_RESULT_CLASS[applicationResult] };
  }
  return {
    label: MEMBER_STATUS_LABEL[member.status] ?? member.status,
    className: MEMBER_STATUS_CLASS[member.status] ?? 'bg-graysoft text-charcoal-2',
  };
}
