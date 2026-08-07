'use client';

import type { AdminFeeClubDetail } from '@duing/types';

import { formatFeeAmount } from '../_lib/feeAuditLabels';

/**
 * 동아리 회비 현황 KPI(스펙 §8.3). 헤더 기간 셀렉터가 고른 구간의 집계라 탭을 옮겨도 같은 숫자를 본다.
 *
 * <p>청구 건수는 취소 청구를 포함하고 금액(총 수납·미수금)은 취소 청구를 빼므로 건수와 금액의 모수가 다르다 —
 * 완납+미납+연체+취소가 청구 건수와 맞아떨어지는지로 검산하지 않게 건수 카드끼리 붙여 둔다.
 */
export function FeeKpiCards({ detail }: { detail: AdminFeeClubDetail }) {
  return (
    <ul
      aria-label="동아리 회비 현황"
      className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      <Kpi label="총 회원" value={`${count(detail.memberCount)}명`} />
      <Kpi label="활성 정책" value={`${count(detail.activePolicyCount)}개`} />
      <Kpi label="청구 건수" value={`${count(detail.billCount)}건`} />
      <Kpi label="완납" value={`${count(detail.paidCount)}건`} />
      <Kpi label="미납" value={`${count(detail.unpaidCount)}건`} warn={detail.unpaidCount > 0} />
      {/* 연체는 저장된 상태가 아니라 마감일에서 파생된다 — 근거를 적어 두지 않으면 청구 표의 상태 배지와
          어긋나 보인다(연체 전이 배치가 늦으면 status 는 아직 PENDING 이다). */}
      <Kpi
        label="연체"
        value={`${count(detail.overdueCount)}건`}
        caption="마감일 기준 산출"
        warn={detail.overdueCount > 0}
      />
      <Kpi label="취소" value={`${count(detail.cancelledCount)}건`} />
      <Kpi label="총 수납" value={`${formatFeeAmount(detail.totalPaid ?? 0)}원`} />
      <Kpi
        label="미수금"
        value={`${formatFeeAmount(detail.outstanding ?? 0)}원`}
        warn={(detail.outstanding ?? 0) > 0}
      />
      <Kpi label="수납률" value={`${detail.collectionRate ?? 0}%`} />
    </ul>
  );
}

/** 배포 전환기에 서버가 아직 안 내려주는 집계가 있어도 "NaN건"을 찍지 않게 0 으로 떨어뜨린다. */
function count(value: number | undefined): string {
  return (value ?? 0).toLocaleString('ko-KR');
}

function Kpi({
  label,
  value,
  caption,
  warn = false,
}: {
  label: string;
  value: string;
  /** 숫자만으로는 오해할 수 있는 카드의 산출 근거 한 줄. */
  caption?: string;
  warn?: boolean;
}) {
  return (
    <li className="rounded-[14px] border border-line bg-paper px-3.5 py-3">
      <p className="text-[11.5px] font-semibold text-charcoal-3">{label}</p>
      <p
        className={`mt-1 truncate text-[17px] font-bold tabular-nums ${warn ? 'text-danger' : 'text-ink'}`}
      >
        {value}
      </p>
      {caption !== undefined && <p className="mt-0.5 text-[11px] text-charcoal-3">{caption}</p>}
    </li>
  );
}
