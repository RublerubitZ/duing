import { promoApplicants, promoFunnel, type PromoApplicantStatus } from '../../_data';

function statusClass(status: PromoApplicantStatus): string {
  if (status === '합격') return 'pill-sky';
  if (status === '면접확정') return 'pill';
  return 'pill-warm';
}

/** 운영 대시보드 — 지원자 테이블 + 모집 펀넬 통계 미리보기. */
export function AdminMockup() {
  const maxFunnel = promoFunnel[0]?.value ?? 1;

  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-2">
      {/* 펀넬 */}
      <div className="mb-3.5 flex items-end gap-2">
        {promoFunnel.map((stage) => (
          <div key={stage.label} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="font-mono text-[12px] font-bold text-ink-deep">{stage.value}</span>
            <div className="flex h-16 w-full items-end">
              <div
                className="w-full rounded-sm bg-ink"
                style={{ height: `${Math.max(8, Math.round((stage.value / maxFunnel) * 100))}%` }}
              />
            </div>
            <span className="text-[10.5px] text-charcoal-3">{stage.label}</span>
          </div>
        ))}
      </div>

      {/* 지원자 테이블 */}
      <div className="overflow-hidden rounded-md border border-line">
        <div className="grid grid-cols-[1fr_1fr_auto] items-center gap-2.5 bg-paper px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-charcoal-3">
          <span>지원자</span>
          <span>학과</span>
          <span>상태</span>
        </div>
        {promoApplicants.map((applicant, idx) => (
          <div
            key={applicant.id}
            className={`grid grid-cols-[1fr_1fr_auto] items-center gap-2.5 bg-cream px-3.5 py-2.5 text-[12.5px] ${
              idx > 0 ? 'border-t border-line' : ''
            }`}
          >
            <span className="flex items-center gap-2 font-medium text-charcoal">
              <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-sage-mist text-[10.5px] font-bold text-ink">
                {applicant.name[0]}
              </span>
              {applicant.name}
            </span>
            <span className="text-charcoal-2">{applicant.dept.replace('학과', '')}</span>
            <span className={`pill ${statusClass(applicant.status)} text-[11px]`}>
              {applicant.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
