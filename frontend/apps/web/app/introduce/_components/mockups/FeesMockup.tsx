import { promoFeeMatches } from '../../_data';

const FEE_STATS = [
  { value: '38', label: '납부', highlight: true },
  { value: '5', label: '미납', highlight: false },
] as const;

function formatWon(amount: number): string {
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 회비 — 청구 현황 + 은행 거래 자동매칭 미리보기. */
export function FeesMockup() {
  return (
    <div className="rounded-lg border border-line bg-paper p-4 shadow-2">
      <div className="mb-3.5 grid grid-cols-2 gap-2.5">
        {FEE_STATS.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-md border px-3.5 py-3 ${
              stat.highlight ? 'border-line bg-sage-mist' : 'border-line bg-cream'
            }`}
          >
            <div className="tabular-nums text-[22px] font-bold text-ink-deep">{stat.value}</div>
            <div className="mt-0.5 text-[11.5px] text-charcoal-3">{stat.label}</div>
          </div>
        ))}
      </div>

      <p className="mb-2 tabular-nums text-[11px] font-semibold uppercase tracking-[0.14em] text-charcoal-3">
        은행 입금 자동매칭
      </p>
      <div className="overflow-hidden rounded-md border border-line">
        {promoFeeMatches.map((row, idx) => (
          <div
            key={row.id}
            className={`flex items-center justify-between bg-cream px-3 py-2.5 ${
              idx > 0 ? 'border-t border-line' : ''
            }`}
          >
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-charcoal">{row.payer} 입금</div>
              <div className="mt-0.5 tabular-nums text-[11px] text-charcoal-3">
                {formatWon(row.amount)} → {row.member}
              </div>
            </div>
            {row.matched ? (
              <span className="pill gap-1.5 text-[11px]">
                <span className="h-1.5 w-1.5 rounded-full bg-sage" />
                매칭됨
              </span>
            ) : (
              <span className="pill pill-outline text-[11px]">확인 필요</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
