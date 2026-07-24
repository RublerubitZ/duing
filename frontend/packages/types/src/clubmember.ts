import type { College, Grade } from './user';

// 동아리 단위 역할 (Club-scoped). 시스템 전역 역할은 UserRole 참조.
export type ClubMemberRole = 'MEMBER' | 'OFFICER' | 'LEADER';

// 멤버 목록·EXPORT 응답의 회비 납부 상태 요약. BE MemberFeeStatus enum 과 1:1.
// 가장 최근 비-CANCELLED 청구 기준(PAID / 그 외 UNPAID / 청구 없음 NONE).
export type MemberFeeStatus = 'PAID' | 'UNPAID' | 'NONE';

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
  // 기수(회원이 합류한 기). use_generation 표시 설정과 무관하게 저장되며, 미설정 시 null.
  generation: number | null;
  feeStatus: MemberFeeStatus;
};

// 승급/강등 페이로드. LEADER 는 받을 수 없음 (3.7 transferLeader 로만 변경).
export type UpdateMemberRolePayload = {
  role: 'OFFICER' | 'MEMBER';
};

// 회장 이양 응답. formerLeader/newLeader 는 ClubMember 를 재사용하지만, BE 가 이양 응답에는
// 회비 상태를 계산하지 않고 feeStatus 를 항상 'NONE' 으로 채운다(generation 도 신뢰 불가).
// ⚠️ 이 결과로 멤버 목록 캐시를 setQueryData 하지 말 것 — 회비/기수가 오염된다. invalidate 만 한다.
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
  generation: number | null;
  feeStatus: MemberFeeStatus;
};
