import type { College, Grade } from './user';

// 동아리 단위 역할 (Club-scoped). 시스템 전역 역할은 UserRole 참조.
export type ClubMemberRole = 'MEMBER' | 'OFFICER' | 'LEADER';

// GET /admin/clubs/{clubId}/members — 총동연 전용 동아리원 명단(학교 제출용, BE AdminClubMemberResponse 1:1).
// 리더용 ClubMember 와 달리 college 를 포함하고 전화번호는 담지 않는다. grade·college 는 원값(라벨은 FE).
export type AdminClubMember = {
  memberId: number;
  name: string;
  studentId: string;
  major: string;
  college: College;
  grade: Grade;
  role: ClubMemberRole;
};

export type ClubMember = {
  memberId: number;
  userId: number;
  name: string;
  studentId: string;
  role: ClubMemberRole;
  joinedAt: string;
  major: string;
  grade: Grade;
  // 개인정보 최소 노출 정책에 따라 백엔드에서 마스킹된 값(010-****-5678). 미등록 시 null.
  phoneMasked: string | null;
};

// 승급/강등 페이로드. LEADER 는 받을 수 없음 (3.7 transferLeader 로만 변경).
export type UpdateMemberRolePayload = {
  role: 'OFFICER' | 'MEMBER';
};

export type TransferLeaderResult = {
  formerLeader: ClubMember;
  newLeader: ClubMember;
};

export type ClubMemberExportRow = {
  memberId: number;
  name: string;
  studentId: string;
  major: string;
  phone: string | null;
  role: ClubMemberRole;
  joinedAt: string;
};
