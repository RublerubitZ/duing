// 동아리 단위 역할 (Club-scoped). 시스템 전역 역할은 UserRole 참조.
export type ClubMemberRole = 'MEMBER' | 'OFFICER' | 'LEADER';

export type ClubMember = {
  memberId: number;
  userId: number;
  name: string;
  studentId: string;
  role: ClubMemberRole;
  joinedAt: string;
};

// 승급/강등 페이로드. LEADER 는 받을 수 없음 (3.7 transferLeader 로만 변경).
export type UpdateMemberRolePayload = {
  role: 'OFFICER' | 'MEMBER';
};

export type TransferLeaderResult = {
  formerLeader: ClubMember;
  newLeader: ClubMember;
};
