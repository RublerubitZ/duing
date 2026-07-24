import type { ClubMemberRole } from '@duing/types';

// ClubMember 역할 Enum(LEADER/OFFICER/MEMBER)의 UI 표기 단일 소스.
// Enum 값은 불변이며 라벨만 회장/임원/부원으로 통일한다.
const LABELS: Record<ClubMemberRole, string> = {
  LEADER: '회장',
  OFFICER: '임원',
  MEMBER: '부원',
};

export function clubMemberRoleLabel(role: ClubMemberRole): string {
  return LABELS[role];
}
