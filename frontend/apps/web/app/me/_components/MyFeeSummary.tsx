import type { MyFee } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { computeDday } from '@/app/_lib/dday';
import { formatWon } from '@/app/_lib/feeLabels';

type Props = {
  fees: MyFee[];
  // 마감 D-day 계산 기준 "오늘". 호출처(클라이언트)에서 주입해 컴포넌트를 순수하게 유지하고
  // 서버/클라이언트 시각 차이로 인한 하이드레이션 불일치를 원천 차단한다.
  today: Date;
};

/**
 * 여러 동아리 청구를 가로질러 미납 현황을 한눈에 보여주는 상단 요약.
 * 미납 = 취소가 아니고 잔액(remainingAmount, 백엔드 계산값)이 남은 청구 — PENDING·PARTIAL_PAID·OVERDUE 포괄.
 * 연체가 있으면 "연체 N건"을 메인으로 강조(coral)하고 다음 마감은 숨긴다. 연체가 없으면 가장 이른 마감을 안내한다.
 */
export function MyFeeSummary({ fees, today }: Props) {
  // 취소 여부는 저장 status 로 판정한다 — 파생 표기가 아니라 실제로 청구가 살아 있는지의 문제다.
  const unpaidFees = fees.filter((fee) => fee.status !== 'CANCELLED' && fee.remainingAmount > 0);

  if (unpaidFees.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-sage/10 px-5 py-4">
        <p className="text-sm font-semibold text-sage">미납 회비가 없어요 · 모두 납부 완료</p>
      </div>
    );
  }

  const totalOutstanding = unpaidFees.reduce((sum, fee) => sum + fee.remainingAmount, 0);
  // 연체 강조는 표기 축(displayStatus) 기준 — 연체 전이 배치가 늦어도 마감이 지난 미납은 연체로 센다.
  const overdueCount = unpaidFees.filter((fee) => fee.displayStatus === 'OVERDUE').length;
  const hasOverdue = overdueCount > 0;
  // YYYY-MM-DD 사전식 정렬 = 날짜 오름차순. 가장 이른 미납 마감.
  const nearestDueDate = unpaidFees.map((fee) => fee.dueDate).sort()[0] ?? '';

  return (
    <div
      className={cn(
        'rounded-xl border px-5 py-4',
        hasOverdue ? 'border-coral/30 bg-coral/5' : 'border-line bg-graysoft/40',
      )}
    >
      <p className="text-xs font-semibold text-charcoal-3">미납 회비</p>
      <p className={cn('mt-0.5 text-2xl font-bold', hasOverdue ? 'text-coral' : 'text-ink')}>
        {formatWon(totalOutstanding)}
      </p>
      {hasOverdue ? (
        <p className="mt-1 text-xs font-semibold text-coral">연체 {overdueCount}건</p>
      ) : (
        <p className="mt-1 text-xs text-charcoal-3">
          미납 {unpaidFees.length}건 · 다음 마감 {nearestDueDate} (
          {computeDday(nearestDueDate, today)})
        </p>
      )}
    </div>
  );
}
