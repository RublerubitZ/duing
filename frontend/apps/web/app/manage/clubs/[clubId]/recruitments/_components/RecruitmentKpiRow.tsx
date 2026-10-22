'use client';

import type { RecruitmentSummary } from '@duing/types';
import { countAwaitingReview, useRecruitmentStatsSummaryQuery } from '@duing/hooks';
import {
  APPLICATION_AWAITING_REVIEW_LABEL,
  APPLICATION_STATUS_OPERATOR_LABEL,
} from '@/app/_constants/application-status';

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
 * 타일이 지원자 관리 화면의 상태 필터와 대응하므로 "보고 → 처리" 동선이 이어진다 —
 * 검토 대기만 지원 완료·보류 두 칩의 합이라 자체 지원 모집에서는 그 구성을 부제로 밝힌다.
 */
export function RecruitmentKpiRow({ recruitment }: Props) {
  // 외부 폼은 지원 데이터가 없어 조회하지 않는다 — 0 대신 총동연과 같은 "—"(아무도 안 냈다로 읽히지 않게).
  const { data: summary } = useRecruitmentStatsSummaryQuery(
    recruitment.applicationMode === 'EXTERNAL' ? undefined : recruitment.id,
  );

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
        sub={`모집 인원 ${recruitment.capacity}명`}
      />
      <KpiTile
        label={APPLICATION_AWAITING_REVIEW_LABEL}
        value={summary ? String(countAwaitingReview(summary)) : '—'}
        sub={
          recruitment.applicationMode === 'SELF'
            ? `${APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED} + ${APPLICATION_STATUS_OPERATOR_LABEL.ON_HOLD}`
            : undefined
        }
      />
      <KpiTile label={APPLICATION_STATUS_OPERATOR_LABEL.INTERVIEW_PENDING} value={interviewPendingValue} />
      <KpiTile label={APPLICATION_STATUS_OPERATOR_LABEL.ACCEPTED} value={summary ? String(summary.accepted) : '—'} />
    </div>
  );
}
