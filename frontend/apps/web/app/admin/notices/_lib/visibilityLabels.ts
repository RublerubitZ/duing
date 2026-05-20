import type { NoticeVisibility, NoticeClubScopeRole } from '@duing/types';

export const VISIBILITY_LABEL: Record<NoticeVisibility, string> = {
  PUBLIC: '전체 공개',
  OFFICERS_ALL: '전 동아리 운영진',
  CLUB_SCOPED: '특정 동아리',
};

export const CLUB_SCOPE_ROLE_LABEL: Record<NoticeClubScopeRole, string> = {
  OFFICERS_ONLY: '해당 동아리 운영진만',
  ALL_MEMBERS: '해당 동아리 멤버 전원',
};
