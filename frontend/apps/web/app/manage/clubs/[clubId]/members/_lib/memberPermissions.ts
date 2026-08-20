import type { ClubMemberRole } from '@duing/types';

/**
 * 회원 관리 화면의 역할별 가능 액션 매트릭스 — 페이지·벌크 툴바·상세 패널·표에 흩어져
 * 주석 상호참조로 동기화되던 파생 불리언의 단일 정의 지점. BE 가드와 같은 규칙이다(역할 변경·탈퇴
 * 처리·회장 인계는 OFFICER 에게 403).
 *
 * isSelf(본인 행)·isLeaderRow(회장 행) 같은 행 단위 축은 역할 축이 아니므로 여기 두지 않는다 —
 * 호출부가 이 플래그와 조합한다.
 */
export type MemberPermissions = {
  /** 승급·강등 (단건·벌크 공통) */
  canChangeRole: boolean;
  /** 탈퇴시키기 (단건·벌크 공통) */
  canKick: boolean;
  /** 회장 인계 */
  canTransferLeadership: boolean;
  /** 회장 승계 요청 — 임원 전용(회장은 이미 회장이라 대상이 아니다) */
  canRequestSuccession: boolean;
  /** 기수 수정 — 운영진 공통이되 기수를 쓰는 동아리에서만 */
  canEditGeneration: boolean;
  /** 선택 체크박스·일괄 툴바 노출 */
  bulkSelectable: boolean;
};

export function memberPermissions(
  viewerRole: ClubMemberRole,
  { useGeneration }: { useGeneration: boolean },
): MemberPermissions {
  // MEMBER 는 운영 콘솔에 도달할 수 없는 폴백 값(ManagedClub.myRole 은 LEADER|OFFICER)이라
  // 두 역할 어디에도 걸리지 않아 전 플래그가 닫힌다 — 호출부의 `?? 'MEMBER'` 기본값이 곧 최소 권한이다.
  const isLeader = viewerRole === 'LEADER';
  const isOfficer = viewerRole === 'OFFICER';

  const canChangeRole = isLeader;
  const canEditGeneration = (isLeader || isOfficer) && useGeneration;

  return {
    canChangeRole,
    canKick: isLeader,
    canTransferLeadership: isLeader,
    canRequestSuccession: isOfficer,
    canEditGeneration,
    // 실행 가능한 벌크 액션이 하나라도 있을 때만 선택 UI 를 연다 — 회장은 승급·강등·탈퇴가 있어 항상,
    // 임원은 기수 일괄 변경뿐이라 기수를 쓰는 동아리에서만.
    bulkSelectable: canChangeRole || canEditGeneration,
  };
}
