import type { ClubMember } from '@duing/types';
import { isRecentJoin } from './memberFilters';

// KPI 타일 1개의 표시 데이터. sub 는 부가 설명(회장/임원 분해, 보유자 수 등)으로 없을 수 있다.
export type Kpi = {
  label: string;
  value: string;
  sub?: string;
};

// 회원 명단 요약 KPI 4종을 계산하는 순수 함수. now 를 주입하면 "최근 가입" 판정을 결정적으로 테스트할 수 있다.
// ① 재적 회원(전체 수) ② 임원(회장+임원 합계, 서브에 분해) ③ 회비 미납(UNPAID 수)
// ④ useGeneration=true → 최신 기수(최고 generation·보유자 수, 전원 null 이면 "—")
//    useGeneration=false → 최근 가입(RECENT_JOIN_DAYS 이내, filterMembers 의 RECENT 와 동일 기준)
export function computeMemberKpis(
  members: ClubMember[],
  useGeneration: boolean,
  now: Date = new Date(),
): Kpi[] {
  const leaderCount = members.filter((member) => member.role === 'LEADER').length;
  const officerCount = members.filter((member) => member.role === 'OFFICER').length;
  const unpaidCount = members.filter((member) => member.feeStatus === 'UNPAID').length;

  return [
    { label: '재적 회원', value: String(members.length) },
    {
      label: '임원',
      value: String(leaderCount + officerCount),
      sub: `회장 ${leaderCount} · 임원 ${officerCount}`,
    },
    { label: '회비 미납', value: String(unpaidCount) },
    useGeneration ? latestGenerationKpi(members) : recentJoinKpi(members, now),
  ];
}

function latestGenerationKpi(members: ClubMember[]): Kpi {
  const generations = members
    .map((member) => member.generation)
    .filter((generation): generation is number => generation !== null);

  if (generations.length === 0) {
    return { label: '최신 기수', value: '—' };
  }

  const latest = Math.max(...generations);
  const holders = generations.filter((generation) => generation === latest).length;
  return { label: '최신 기수', value: `${latest}기`, sub: `${holders}명` };
}

function recentJoinKpi(members: ClubMember[], now: Date): Kpi {
  const count = members.filter((member) => isRecentJoin(member, now)).length;
  return { label: '최근 가입', value: `${count}명` };
}
