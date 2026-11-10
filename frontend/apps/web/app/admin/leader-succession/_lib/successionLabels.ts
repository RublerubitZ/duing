import type { ClubMemberEventType, SuccessionStatus } from '@duing/types';

export const SUCCESSION_STATUS_LABEL: Record<SuccessionStatus, string> = {
  PENDING: '대기',
  APPROVED: '승인',
  REJECTED: '거절',
};

export const SUCCESSION_STATUS_BADGE_CLASS: Record<SuccessionStatus, string> = {
  PENDING: 'bg-warm/20 text-warm-deep',
  APPROVED: 'bg-sage-mist text-ink',
  REJECTED: 'bg-coral/20 text-coral-deep',
};

export const CLUB_MEMBER_EVENT_TYPE_LABEL: Record<ClubMemberEventType, string> = {
  ROLE_CHANGED: '역할 변경',
  LEADER_TRANSFERRED: '회장 이관',
  LEFT: '탈퇴',
  REMOVED: '강제 탈퇴',
  ADMIN_LEADER_ASSIGNED: '어드민 회장 지정',
  SUCCESSION_APPROVED: '승계 승인',
};
