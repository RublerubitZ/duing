'use client';

import { useMemo } from 'react';

import { useMyClubsQuery, useMyFeesQuery } from '@duing/hooks';
import type { FeeStatus, MyFee } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { feeStatusLabel, formatWon } from '@/app/_lib/feeLabels';

// 상태별 뱃지 색. 운영진 청구 현황(BillList)과 동일한 팔레트를 사용한다.
const STATUS_BADGE_CLS: Record<FeeStatus, string> = {
  PENDING: 'bg-warm/15 text-charcoal',
  PAID: 'bg-sage/20 text-sage',
  PARTIAL_PAID: 'bg-warm/15 text-charcoal',
  OVERDUE: 'bg-coral/10 text-coral',
  CANCELLED: 'bg-graysoft text-charcoal-3',
};

type ClubGroup = {
  clubId: number;
  clubName: string;
  bills: MyFee[];
};

// 청구를 동아리별로 묶는다. 가입한 동아리명을 우선 사용하고, 매핑이 없으면(탈퇴 등) clubId 를 표기한다.
function groupByClub(myFees: MyFee[], clubNameById: Map<number, string>): ClubGroup[] {
  const groups = new Map<number, ClubGroup>();
  for (const bill of myFees) {
    const existing = groups.get(bill.clubId);
    if (existing) {
      existing.bills.push(bill);
    } else {
      groups.set(bill.clubId, {
        clubId: bill.clubId,
        clubName: clubNameById.get(bill.clubId) ?? `동아리 #${bill.clubId}`,
        bills: [bill],
      });
    }
  }
  return [...groups.values()];
}

export function MyFeeList() {
  const { data: myFees, isLoading: isFeesLoading } = useMyFeesQuery({});
  const { data: myClubs, isLoading: isClubsLoading } = useMyClubsQuery();

  const clubNameById = useMemo(() => {
    const lookup = new Map<number, string>();
    for (const club of myClubs ?? []) {
      lookup.set(club.clubId, club.clubName);
    }
    return lookup;
  }, [myClubs]);

  const groups = useMemo(
    () => groupByClub(myFees ?? [], clubNameById),
    [myFees, clubNameById],
  );

  // 동아리명 로딩까지 함께 기다린다 — 청구가 먼저 도착하면 "동아리 #id" 폴백이 잠깐 깜빡이고
  // 진짜 미매핑(탈퇴 등) 케이스와 구분이 안 되기 때문이다.
  if (isFeesLoading || isClubsLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }

  if (!myFees || myFees.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
        <p className="text-sm text-charcoal-2">청구된 회비가 없습니다.</p>
        <p className="mt-1 text-xs text-charcoal-3">
          가입한 동아리가 회비를 청구하면 이곳에 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.clubId} className="space-y-2">
          <h2 className="text-sm font-bold text-ink">{group.clubName}</h2>
          <ul className="space-y-2">
            {group.bills.map((bill) => (
              <MyFeeRow key={bill.id} bill={bill} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type MyFeeRowProps = {
  bill: MyFee;
};

function MyFeeRow({ bill }: MyFeeRowProps) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">{bill.billingPeriod}</p>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
              STATUS_BADGE_CLS[bill.status],
            )}
          >
            {feeStatusLabel(bill.status)}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-charcoal-3">
          {formatWon(bill.amount)} · 마감 {bill.dueDate}
        </p>
      </div>
    </li>
  );
}
