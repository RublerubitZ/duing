import type { ClubMember, ClubMemberRole } from '@duing/types';
import { daysUntilKst } from '@duing/hooks/datetime';
import { clubMemberRoleLabel } from '@/app/_lib/clubMemberRoleLabel';

// "최근 가입" 필터 기준일수 — 이 일수 이내(KST 캘린더 기준)로 가입한 회원을 최근으로 본다.
export const RECENT_JOIN_DAYS = 90;

// 역할 칩 키: 'ALL' 은 필터 없음(전체). 역할 칩끼리는 상호 배타(하나만 선택).
export type RoleFilterKey = 'ALL' | ClubMemberRole;
// 보조 토글 칩 키 — 서로 독립이며 검색·역할·기수와 AND 로 결합한다.
export type FlagFilterKey = 'UNPAID' | 'RECENT';

// 선언적 필터 정의(칩 렌더링과 필터 적용의 단일 소스). 향후 항목 추가는 배열에 한 줄 추가로 대응한다.
type MemberFilterDef<Key extends string> = {
  key: Key;
  label: string;
  predicate: (member: ClubMember, now: Date) => boolean;
};

export const ROLE_FILTER_DEFS: readonly MemberFilterDef<RoleFilterKey>[] = [
  { key: 'ALL', label: '전체', predicate: () => true },
  { key: 'LEADER', label: clubMemberRoleLabel('LEADER'), predicate: (member) => member.role === 'LEADER' },
  { key: 'OFFICER', label: clubMemberRoleLabel('OFFICER'), predicate: (member) => member.role === 'OFFICER' },
  { key: 'MEMBER', label: clubMemberRoleLabel('MEMBER'), predicate: (member) => member.role === 'MEMBER' },
];

export const FLAG_FILTER_DEFS: readonly MemberFilterDef<FlagFilterKey>[] = [
  { key: 'UNPAID', label: '회비 미납', predicate: (member) => member.feeStatus === 'UNPAID' },
  { key: 'RECENT', label: '최근 가입', predicate: (member, now) => isRecentJoin(member, now) },
];

export type MemberFilters = {
  role: RoleFilterKey;
  flags: FlagFilterKey[];
  // useGeneration=true 이고 특정 기수를 고른 경우만 값. null 이면 기수 필터 없음(전체 기수).
  generation: number | null;
};

export const EMPTY_MEMBER_FILTERS: MemberFilters = {
  role: 'ALL',
  flags: [],
  generation: null,
};

export function isRecentJoin(member: ClubMember, now: Date): boolean {
  // daysUntilKst = 가입일 - 오늘(KST 캘린더 일수). 과거 가입이면 음수이므로 -RECENT_JOIN_DAYS 이상이면 최근.
  return daysUntilKst(member.joinedAt, now) >= -RECENT_JOIN_DAYS;
}

// 존재하는 기수 목록(중복 제거, 최신 기수 우선). 기수 드롭다운 옵션 소스.
export function availableGenerations(members: ClubMember[]): number[] {
  const generations = new Set<number>();
  for (const member of members) {
    if (member.generation !== null) generations.add(member.generation);
  }
  return [...generations].sort((a, b) => b - a);
}

// 검색 대상: 이름·학과·학번·역할 라벨(회장/임원/부원). 기수 "N기" 매칭은 useGeneration=true 일 때만.
function matchesQuery(member: ClubMember, query: string, useGeneration: boolean): boolean {
  const normalized = query.trim().toLowerCase();
  if (normalized === '') return true;

  const fields = [member.name, member.major, member.studentId, clubMemberRoleLabel(member.role)];
  if (fields.some((field) => field.toLowerCase().includes(normalized))) return true;
  // 기수는 완전일치로만 매칭한다("1기" 가 "11기"·"21기" 에 부분일치하는 오탐 방지).
  return useGeneration && member.generation !== null && normalized === `${member.generation}기`;
}

// 검색어 + 역할(배타) + 보조 토글(AND) + 기수(AND, useGeneration 시)로 걸러진 배열을 반환하는 순수 함수.
// now 를 주입하면 "최근 가입" 판정을 결정적으로 테스트할 수 있다(기본값은 현재 시각).
export function filterMembers(
  members: ClubMember[],
  {
    query,
    filters,
    useGeneration,
    now = new Date(),
  }: {
    query: string;
    filters: MemberFilters;
    useGeneration: boolean;
    now?: Date;
  },
): ClubMember[] {
  const roleDef = ROLE_FILTER_DEFS.find((def) => def.key === filters.role);
  const activeFlagDefs = FLAG_FILTER_DEFS.filter((def) => filters.flags.includes(def.key));

  return members.filter((member) => {
    // 알 수 없는 역할 키(정상 흐름엔 없음)는 필터 없음으로 취급한다.
    if (roleDef && !roleDef.predicate(member, now)) return false;
    for (const def of activeFlagDefs) {
      if (!def.predicate(member, now)) return false;
    }
    if (useGeneration && filters.generation !== null && member.generation !== filters.generation) {
      return false;
    }
    return matchesQuery(member, query, useGeneration);
  });
}
