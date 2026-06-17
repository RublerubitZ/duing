'use client';

import { useMemo, useState } from 'react';

import {
  useCancelBillMutation,
  useClubFeeBillsQuery,
  useClubMembersQuery,
} from '@duing/hooks';
import type { BillSearchParams, ClubMember, FeeBill, FeeStatus } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';

import { feeStatusLabel, formatWon } from '@/app/_lib/feeLabels';

import { RecordPaymentDialog } from './RecordPaymentDialog';
import { PaymentHistory } from './PaymentHistory';

type BillListProps = {
  clubId: number;
};

const PAGE_SIZE = 20;

const STATUS_OPTIONS: FeeStatus[] = [
  'PENDING',
  'PAID',
  'PARTIAL_PAID',
  'OVERDUE',
  'CANCELLED',
];

// 상태별 뱃지 색. CANCELLED 는 회색, 미납/부분납부는 warm, 연체는 coral, 납부완료는 sage.
const STATUS_BADGE_CLS: Record<FeeStatus, string> = {
  PENDING: 'bg-warm/15 text-charcoal',
  PAID: 'bg-sage/20 text-sage',
  PARTIAL_PAID: 'bg-warm/15 text-charcoal',
  OVERDUE: 'bg-coral/10 text-coral',
  CANCELLED: 'bg-graysoft text-charcoal-3',
};

const inputCls =
  'rounded-md border border-line px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';

// 회원 검색 드롭다운에 한 번에 보여줄 최대 결과 수.
const MEMBER_SEARCH_LIMIT = 8;

export function BillList({ clubId }: BillListProps) {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState<FeeStatus | ''>('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [selectedMember, setSelectedMember] = useState<ClubMember | null>(null);
  const [memberQuery, setMemberQuery] = useState('');

  const { data: members } = useClubMembersQuery(clubId);

  // userId → ClubMember 매핑. 청구 행/다이얼로그에서 이름·학번을 빠르게 조회한다.
  const memberByUserId = useMemo(() => {
    const map = new Map<number, ClubMember>();
    for (const member of members ?? []) {
      map.set(member.userId, member);
    }
    return map;
  }, [members]);

  const memberOf = (userId: number): ClubMember | undefined => memberByUserId.get(userId);
  // 표시용 라벨 — 회원을 못 찾으면(탈퇴 등) `회원 #id` 로 폴백한다.
  const memberLabel = (userId: number): string => memberOf(userId)?.name ?? `회원 #${userId}`;

  // 이름·학번 부분 일치(대소문자 무시) 검색 결과. 비어 있는 질의는 빈 배열.
  const memberSearchResults = useMemo(() => {
    const query = memberQuery.trim().toLowerCase();
    if (!query) {
      return [];
    }
    return (members ?? [])
      .filter(
        (member) =>
          member.name.toLowerCase().includes(query) ||
          member.studentId.toLowerCase().includes(query),
      )
      .slice(0, MEMBER_SEARCH_LIMIT);
  }, [members, memberQuery]);

  const params: BillSearchParams = {
    page,
    size: PAGE_SIZE,
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(periodFilter.trim() ? { billingPeriod: periodFilter.trim() } : {}),
    ...(selectedMember ? { userId: selectedMember.userId } : {}),
  };

  const { data: bills, isLoading } = useClubFeeBillsQuery(clubId, params);
  const [cancelTarget, setCancelTarget] = useState<FeeBill | null>(null);
  const [recordTarget, setRecordTarget] = useState<FeeBill | null>(null);
  const [historyTarget, setHistoryTarget] = useState<FeeBill | null>(null);

  const selectMember = (member: ClubMember) => {
    setSelectedMember(member);
    setMemberQuery('');
    setPage(0);
  };

  const clearMember = () => {
    setSelectedMember(null);
    setPage(0);
  };

  const page0Based = bills?.page ?? 0;
  const totalPages = bills?.totalPages ?? 0;
  const totalElements = bills?.totalElements ?? 0;
  const hasNext = bills?.hasNext ?? false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="bill-filter-period" className="text-xs font-semibold text-charcoal-2">
            회차
          </label>
          <input
            id="bill-filter-period"
            type="text"
            placeholder="2026-07"
            value={periodFilter}
            onChange={(event) => {
              setPeriodFilter(event.target.value);
              setPage(0);
            }}
            className={inputCls}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="bill-filter-status" className="text-xs font-semibold text-charcoal-2">
            상태
          </label>
          <select
            id="bill-filter-status"
            aria-label="청구 상태 필터"
            value={statusFilter}
            onChange={(event) => {
              const nextStatus = event.target.value;
              setStatusFilter(isFeeStatus(nextStatus) ? nextStatus : '');
              setPage(0);
            }}
            className={inputCls}
          >
            <option value="">전체</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {feeStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>
        <div className="relative flex flex-col gap-1">
          <span className="text-xs font-semibold text-charcoal-2">회원</span>
          {selectedMember ? (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-graysoft px-3 py-2 text-sm text-ink">
              {selectedMember.name} · {selectedMember.studentId}
              <button
                type="button"
                aria-label="회원 필터 해제"
                onClick={clearMember}
                className="text-charcoal-3 transition-colors hover:text-coral"
              >
                ×
              </button>
            </span>
          ) : (
            <>
              <input
                type="text"
                aria-label="회원 검색"
                placeholder="회원 이름·학번 검색"
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                className={inputCls}
              />
              {memberQuery.trim() && (
                <ul className="absolute left-0 top-full z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-paper py-1 shadow-2">
                  {memberSearchResults.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-charcoal-3">검색 결과 없음</li>
                  ) : (
                    memberSearchResults.map((member) => (
                      <li key={member.userId}>
                        <button
                          type="button"
                          onClick={() => selectMember(member)}
                          className="flex w-full items-center px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-graysoft"
                        >
                          {member.name} · {member.studentId}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>
      ) : !bills || bills.content.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-sm text-charcoal-2">발행된 청구가 없습니다.</p>
          <p className="mt-1 text-xs text-charcoal-3">
            {'"청구 발행"'} 버튼으로 활성 회원에게 청구서를 발행하세요.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {bills.content.map((bill) => (
              <BillRow
                key={bill.id}
                clubId={clubId}
                bill={bill}
                member={memberOf(bill.userId)}
                onCancel={() => setCancelTarget(bill)}
                onRecord={() => setRecordTarget(bill)}
                onHistory={() => setHistoryTarget(bill)}
              />
            ))}
          </ul>

          <footer className="flex items-center justify-between text-xs text-charcoal-3">
            <span>총 {totalElements}건</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page0Based === 0}
                className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
              >
                이전
              </button>
              <span>
                {page0Based + 1} / {Math.max(1, totalPages)}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => current + 1)}
                disabled={!hasNext}
                className="rounded-md border border-line px-2 py-1 disabled:opacity-40"
              >
                다음
              </button>
            </div>
          </footer>
        </>
      )}

      {cancelTarget && (
        <CancelBillConfirm
          clubId={clubId}
          bill={cancelTarget}
          memberName={memberLabel(cancelTarget.userId)}
          onClose={() => setCancelTarget(null)}
        />
      )}

      {recordTarget && (
        <RecordPaymentDialog
          clubId={clubId}
          bill={recordTarget}
          memberName={memberLabel(recordTarget.userId)}
          onClose={() => setRecordTarget(null)}
        />
      )}

      {historyTarget && (
        <PaymentHistory
          clubId={clubId}
          bill={historyTarget}
          memberName={memberLabel(historyTarget.userId)}
          onClose={() => setHistoryTarget(null)}
        />
      )}
    </div>
  );
}

type BillRowProps = {
  clubId: number;
  bill: FeeBill;
  member: ClubMember | undefined;
  onCancel: () => void;
  onRecord: () => void;
  onHistory: () => void;
};

function BillRow({ bill, member, onCancel, onRecord, onHistory }: BillRowProps) {
  const isCancelled = bill.status === 'CANCELLED';
  // 이미 완납(remainingAmount<=0)이거나 취소된 청구는 추가 납부 기록 불가(백엔드 400) — 버튼 비활성화.
  const isFullyPaid = bill.remainingAmount <= 0;
  const recordDisabled = isCancelled || isFullyPaid;

  // 진행률 = paidAmount / amount(0 나눔 방지), 0~100% 로 클램프.
  const progressPercent =
    bill.amount > 0 ? Math.min(100, Math.max(0, (bill.paidAmount / bill.amount) * 100)) : 0;

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink">
            {member ? member.name : `회원 #${bill.userId}`}
            {member && (
              <span className="ml-1.5 text-xs font-normal text-charcoal-3">{member.studentId}</span>
            )}
          </p>
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
          {bill.billingPeriod} · {formatWon(bill.amount)} · 마감 {bill.dueDate}
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

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onRecord}
          disabled={recordDisabled}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
            recordDisabled
              ? 'cursor-not-allowed border-line text-charcoal-3 opacity-50'
              : 'border-line text-ink hover:bg-graysoft',
          )}
        >
          납부 기록
        </button>
        <button
          type="button"
          onClick={onHistory}
          className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
        >
          내역
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isCancelled}
          className={cn(
            'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
            isCancelled
              ? 'cursor-not-allowed border-line text-charcoal-3 opacity-50'
              : 'border-line text-coral hover:bg-coral/5',
          )}
        >
          {isCancelled ? '취소됨' : '취소'}
        </button>
      </div>
    </li>
  );
}

type CancelBillConfirmProps = {
  clubId: number;
  bill: FeeBill;
  memberName: string;
  onClose: () => void;
};

function CancelBillConfirm({ clubId, bill, memberName, onClose }: CancelBillConfirmProps) {
  const cancelBill = useCancelBillMutation(clubId);
  const { addToast } = useToast();

  const confirmCancel = () => {
    cancelBill.mutate(bill.id, {
      onSuccess: () => {
        addToast('청구를 취소했습니다.');
        onClose();
      },
      onError: (error) => {
        addToast(error instanceof Error ? error.message : '청구 취소에 실패했습니다.', {
          variant: 'error',
        });
        onClose();
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="청구 취소 확인"
        className="w-full max-w-sm rounded-xl bg-paper p-5 shadow-3"
      >
        <h2 className="text-base font-bold text-ink">청구 취소</h2>
        <p className="mt-2 text-sm text-charcoal-2">
          <span className="font-medium text-ink">{memberName}</span> 의{' '}
          <span className="font-medium text-ink">{bill.billingPeriod}</span> 청구를 취소할까요?
          취소된 청구는 목록에 남으며 같은 회차로 다시 발행할 수 있습니다.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={cancelBill.isPending}
            className="flex-1 rounded-md border border-line py-2.5 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={confirmCancel}
            disabled={cancelBill.isPending}
            className="flex-1 rounded-md bg-coral py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {cancelBill.isPending ? '취소 중…' : '청구 취소'}
          </button>
        </div>
      </div>
    </div>
  );
}

function isFeeStatus(value: string): value is FeeStatus {
  return STATUS_OPTIONS.some((status) => status === value);
}
