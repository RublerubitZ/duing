'use client';

import type { RecruitmentSummary } from '@duing/types';
import { useRecruitmentStatsSummaryQuery } from '@duing/hooks';

type Props = {
  recruitment: RecruitmentSummary;
};

type KpiTileProps = {
  label: string;
  value: string;
  sub?: string;
};

function KpiTile({ label, value, sub }: KpiTileProps) {
  return (
    <div className="card p-4">
      <div className="text-xs text-charcoal-3">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tabular-nums text-ink-deep">{value}</div>
      {sub && <div className="mt-1 text-xs text-charcoal-3">{sub}</div>}
    </div>
  );
}

/**
 * 활성 모집 1건의 현황 버킷 4종 — stats summary 단독 구성(추가 쿼리 금지).
 * 4타일이 지원자 관리 화면의 상태 필터와 1:1 대응하므로 "보고 → 처리" 동선이 이어진다.
 */
export function RecruitmentKpiRow({ recruitment }: Props) {
  const { data: summary } = useRecruitmentStatsSummaryQuery(recruitment.id);

  const interviewPendingValue = !recruitment.useInterview
    ? '—'
    : summary
      ? String(summary.interviewPending)
      : '—';

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <KpiTile
        label="지원자"
        value={summary ? String(summary.total) : '—'}
        sub={`정원 ${recruitment.capacity}명`}
      />
      <KpiTile label="검토 대기" value={summary ? String(summary.underReview) : '—'} />
      <KpiTile label="면접 대기" value={interviewPendingValue} />
      <KpiTile label="합격" value={summary ? String(summary.accepted) : '—'} />
    </div>
  );
}
