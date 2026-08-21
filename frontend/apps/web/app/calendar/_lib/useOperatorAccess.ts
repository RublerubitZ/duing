'use client';

import { useManagedClubsQuery, useMeQuery } from '@duing/hooks';

import type { ManagedClub } from '@duing/types';

export type OperatorAccess = {
  isAuthenticated: boolean;
  /** 프로필 확정 전 — 비로그인 배너·빈 상태 문구를 성급히 띄우지 않으려는 소비처가 쓴다. */
  isMeLoading: boolean;
  isAdmin: boolean;
  managedClubs: ManagedClub[];
  /** 일정 추가 권한 — 두 축의 합집합. */
  canOperate: boolean;
};

/**
 * 캘린더 일정 추가 권한의 단일 판정 지점.
 *
 * <p>총동연(ADMIN)은 어느 동아리의 멤버도 아니라 "운영 동아리 보유" 와는 별개 축이다 —
 * 두 축의 합집합이 일정 추가 권한이다. 이 복합 규칙이 캘린더 페이지와 디스패처에 인라인으로
 * 복제돼 서로를 주석으로 참조하며 동기화되고 있었다(한쪽만 고치면 버튼은 보이는데 모달은
 * "권한 없음" 을 띄우는 어긋남이 난다).
 *
 * <p>인증 판정은 현행 시멘틱인 프로필 확정(`!!meQuery.data`)을 그대로 유지한다 — 스토어 시드를
 * 믿지 않는다. 시드로 바꾸면 캘린더 비로그인 배너의 하이드레이션 방어(서버 프레임에는 me
 * 요청이 없어 isLoading=false 인데, 클라이언트 첫 렌더는 부팅 복원 때문에 true 다)를 함께
 * 재설계해야 하므로 전환은 후속으로 미룬다.
 *
 * <p>비로그인 상태에서는 managed 조회를 아예 띄우지 않는다(401 콘솔 노이즈 방지) — 비로그인
 * 사용자에게 운영 동아리가 있을 수 없어 빈 배열과 의미상 같다.
 */
export function useOperatorAccess(): OperatorAccess {
  const meQuery = useMeQuery();
  const isAuthenticated = !!meQuery.data;
  const isAdmin = meQuery.data?.role === 'ADMIN';
  const managedClubsQuery = useManagedClubsQuery({ enabled: isAuthenticated });
  const managedClubs: ManagedClub[] = managedClubsQuery.data ?? [];

  return {
    isAuthenticated,
    isMeLoading: meQuery.isLoading,
    isAdmin,
    managedClubs,
    canOperate: isAdmin || managedClubs.length > 0,
  };
}
