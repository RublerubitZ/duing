// 동아리 단위 역할 (Club-scoped). 시스템 전역 역할은 UserRole 참조.
export type ClubMemberRole = 'MEMBER' | 'OFFICER' | 'LEADER';

export interface ClubMember {
  id: number;
  clubId: number;
  userId: number;
  userName: string;
  role: ClubMemberRole;
  joinedAt: string;
}
