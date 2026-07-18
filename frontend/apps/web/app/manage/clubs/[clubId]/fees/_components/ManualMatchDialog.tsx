'use client';

import { useMemo, useState } from 'react';

import { ApiError } from '@duing/api';
import { useApproveMatchMutation, useClubFeeBillsQuery, useClubMembersQuery } from '@duing/hooks';
import type { ClubMember, FeeBill, FeeStatus } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { feeStatusLabel, formatWon } from '@/app/_lib/feeLabels';
import { Spinner } from '@/components/loading/Spinner';

type ManualMatchDialogProps = {
  clubId: number;
  txId: number;
  depositAmount: number;
  counterparty: string | null;
  onClose: () => void;
};

const inputCls =
  'w-full rounded-md border border-line px-3 py-2 text-sm outline-none transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';

// 회원 검색 드롭다운에 한 번에 보여줄 최대 결과 수(BillList 와 동일).
const MEMBER_SEARCH_LIMIT = 8;

// 미납으로 간주해 입금을 적용할 수 있는 청구 상태(완납·취소는 제외).
const UNPAID_STATUSES: FeeStatus[] = ['PENDING', 'PARTIAL_PAID', 'OVERDUE'];

function isUnpaid(status: FeeStatus): boolean {
  return UNPAID_STATUSES.includes(status);
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  // 409(AlreadyMatched): 동기화 타임아웃 등으로 서버 상태가 이미 바뀐 거래에 적용을 시도한 경우다.
  if (error instanceof ApiError && error.status === 409) {
    return '이미 처리된 거래예요. 목록을 새로고침했어요.';
  }
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function ManualMatchDialog({
  clubId,
  txId,
  depositAmount,
  counterparty,
  onClose,
}: ManualMatchDialogProps) {
  const { addToast } = useToast();
  const approveMatch = useApproveMatchMutation(clubId);

  const { data: members } = useClubMembersQuery(clubId);

  // 입금자명이 있으면 검색어를 미리 채워 총무가 바로 후보를 확인하도록 돕는다(선택 사항).
  const [memberQuery, setMemberQuery] = useState(counterparty ?? '');
  const [selectedMember, setSelectedMember] = useState<ClubMember | null>(null);

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

  const selectMember = (member: ClubMember) => {
    setSelectedMember(member);
    setMemberQuery('');
  };

  const clearMember = () => {
    setSelectedMember(null);
    setMemberQuery('');
  };

  const applyToBill = (bill: FeeBill) => {
    approveMatch.mutate(
      { txId, feeBillId: bill.id },
      {
        onSuccess: () => {
          addToast('입금을 적용했습니다.');
          onClose();
        },
        onError: (error) =>
          addToast(mutationErrorMessage(error, '입금 적용에 실패했습니다.'), { variant: 'error' }),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>회원 선택 후 매칭</DialogTitle>
          <DialogDescription className="text-sm text-charcoal-2">
            입금 {formatWon(depositAmount)}을 어느 회원·청구에 적용할지 선택하세요.
            {counterparty && ` (입금자 ${counterparty})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative flex flex-col gap-1">
            <span className="text-xs font-semibold text-charcoal-2">회원</span>
            {selectedMember ? (
              <span className="inline-flex w-fit items-center gap-1.5 rounded-md border border-line bg-graysoft px-3 py-2 text-sm text-ink">
                {selectedMember.name} · {selectedMember.studentId}
                <button
                  type="button"
                  aria-label="회원 선택 해제"
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

          {selectedMember && (
            <ApplicableBills
              clubId={clubId}
              member={selectedMember}
              depositAmount={depositAmount}
              isApplying={approveMatch.isPending}
              onApply={applyToBill}
            />
          )}
        </div>

        <div className="flex pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={approveMatch.isPending}
            className="flex-1 rounded-md border border-line py-2.5 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
          >
            닫기
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ApplicableBillsProps = {
  clubId: number;
  member: ClubMember;
  depositAmount: number;
  isApplying: boolean;
  onApply: (bill: FeeBill) => void;
};

function ApplicableBills({
  clubId,
  member,
  depositAmount,
  isApplying,
  onApply,
}: ApplicableBillsProps) {
  const { data: billsPage, isLoading } = useClubFeeBillsQuery(clubId, {
    userId: member.userId,
    size: 50,
  });

  // 미납 상태이면서 잔액이 입금액 이상인 청구만 적용 가능(백엔드: 입금 ≤ 잔액).
  const applicableBills = (billsPage?.content ?? []).filter(
    (bill) => isUnpaid(bill.status) && bill.remainingAmount >= depositAmount,
  );

  if (isLoading) {
    return (
      <div role="status" aria-label="청구 목록 불러오는 중" className="delayed-show">
        <Spinner size={16} className="text-charcoal-3" />
      </div>
    );
  }

  if (applicableBills.length === 0) {
    return (
      <p className="rounded-md bg-graysoft px-3 py-3 text-sm text-charcoal-2">
        이 회원에게 적용 가능한 미납 청구가 없어요. (잔액이 입금액 {formatWon(depositAmount)} 이상인
        청구만 적용 가능)
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {applicableBills.map((bill) => {
        const isFullPayment = bill.remainingAmount === depositAmount;
        return (
          <li
            key={bill.id}
            className="flex items-center justify-between gap-4 rounded-md bg-graysoft px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">
                {bill.billingPeriod} · 잔액 {formatWon(bill.remainingAmount)}
              </p>
              <p className="mt-0.5 text-xs text-charcoal-3">
                {feeStatusLabel(bill.status)} · {isFullPayment ? '완납' : '부분납부'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onApply(bill)}
              disabled={isApplying}
              className={cn(
                'shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-ink-deep disabled:opacity-50',
              )}
            >
              이 청구에 적용
            </button>
          </li>
        );
      })}
    </ul>
  );
}
