import type { ClubMember } from '@duing/types';
import { computeMemberKpis, type Kpi } from '../_lib/memberKpis';

type Props = {
  members: ClubMember[];
  useGeneration: boolean;
};

function KpiTile({ label, value, sub }: Kpi) {
  return (
    <div className="card p-4">
      <div className="text-xs text-charcoal-3">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-ink-deep">{value}</div>
      {sub && <div className="mt-1 text-xs text-charcoal-3">{sub}</div>}
    </div>
  );
}

/**
 * 회원 명단 요약 KPI 4종 — 모집 관리 RecruitmentKpiRow 타일 스타일을 따른다.
 * 4번째 타일은 use_generation 표시 설정에 따라 최신 기수/최근 가입으로 전환된다.
 */
export function MemberKpis({ members, useGeneration }: Props) {
  const kpis = computeMemberKpis(members, useGeneration);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiTile key={kpi.label} {...kpi} />
      ))}
    </div>
  );
}
