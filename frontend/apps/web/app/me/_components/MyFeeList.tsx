'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Copy } from 'lucide-react';

import { useMemberFeeAccountQuery, useMyClubsQuery, useMyFeesQuery } from '@duing/hooks';
import type { FeeStatus, MyFee } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { bankLabel, feeStatusLabel, formatWon } from '@/app/_lib/feeLabels';
import { toRoute } from '@/app/_lib/route';

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
        <ClubFeeGroup key={group.clubId} group={group} />
      ))}
    </div>
  );
}

type ClubFeeGroupProps = {
  group: ClubGroup;
};

// 동아리 1개 그룹. 회비 계좌 조회 훅은 컴포넌트 인스턴스당 1번만 호출해야 하므로(React Hooks 규칙)
// MyFeeList 의 map 안에서 직접 부르지 않고 그룹 단위 자식 컴포넌트로 분리한다.
function ClubFeeGroup({ group }: ClubFeeGroupProps) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-bold text-ink">{group.clubName}</h2>
      <FeeAccountNotice clubId={group.clubId} />
      <ul className="space-y-2">
        {group.bills.map((bill) => (
          <MyFeeRow key={bill.id} bill={bill} />
        ))}
      </ul>
    </section>
  );
}

type FeeAccountNoticeProps = {
  clubId: number;
};

// 동아리원이 회비를 입금할 납부 계좌 안내. 미등록(404)은 정상적인 빈 상태이므로 에러로 표시하지 않고
// 옅은 힌트만 노출한다. 로딩 중에는 청구 목록을 막지 않도록 아무것도 그리지 않는다.
function FeeAccountNotice({ clubId }: FeeAccountNoticeProps) {
  const { data: account, isLoading } = useMemberFeeAccountQuery(clubId);
  const { addToast } = useToast();
  const [copied, setCopied] = useState(false);

  if (isLoading) {
    return null;
  }

  // 미등록(404)은 ApiError 로 surface 되어 data 가 비어 있다 — 에러 UI 가 아니라 옅은 안내로 처리한다.
  if (!account) {
    return <p className="px-1 text-xs text-charcoal-3">납부 계좌가 등록되지 않았어요.</p>;
  }

  const copyAccountNumber = async () => {
    try {
      await navigator.clipboard.writeText(account.accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      addToast('계좌번호를 복사했어요');
    } catch {
      setCopied(false);
      addToast('계좌번호 복사에 실패했어요', { variant: 'error' });
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-graysoft/40 px-4 py-2.5">
      <p className="min-w-0 truncate text-xs text-charcoal-2">
        <span className="font-semibold text-charcoal-3">납부 계좌</span>{' '}
        {bankLabel(account.bank)} {account.accountNumber} · 예금주 {account.accountHolder}
      </p>
      <button
        type="button"
        onClick={copyAccountNumber}
        aria-label="계좌번호 복사"
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold transition-colors',
          'text-charcoal-2 hover:bg-sage-tint hover:text-ink',
        )}
      >
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  );
}

type MyFeeRowProps = {
  bill: MyFee;
};

function MyFeeRow({ bill }: MyFeeRowProps) {
  // 진행률 = paidAmount / amount(0 나눔 방지), 0~100% 로 클램프. 운영진 청구 현황(BillRow)과 동일.
  const progressPercent =
    bill.amount > 0 ? Math.min(100, Math.max(0, (bill.paidAmount / bill.amount) * 100)) : 0;

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0 flex-1">
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

        <div className="mt-2">
          <p className="text-xs text-charcoal-2">
            납부 {formatWon(bill.paidAmount)} / {formatWon(bill.amount)}
            {bill.remainingAmount > 0 && (
              <span className="text-charcoal-3"> · 남은 {formatWon(bill.remainingAmount)}</span>
            )}
          </p>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-graysoft">
            <div
              className="h-full rounded-full bg-sage transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
      {bill.paidAmount > 0 && bill.status !== 'CANCELLED' && (
        <Link
          href={toRoute(`/me/fees/${bill.id}/receipt`)}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
        >
          영수증
        </Link>
      )}
    </li>
  );
}
