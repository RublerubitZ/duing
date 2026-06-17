'use client';

import { useState } from 'react';

import { ApiError } from '@duing/api';
import {
  useApproveMatchMutation,
  useBankTransactionsQuery,
  useIgnoreTransactionMutation,
  useUnmatchTransactionMutation,
} from '@duing/hooks';
import type { BankTransaction, MatchCandidate } from '@duing/types';

import { useToast } from '@/app/_components/toast/ToastProvider';

import { formatWon } from '@/app/_lib/feeLabels';

type BankReviewQueueProps = {
  clubId: number;
};

// ISO 일시 문자열(YYYY-MM-DDTHH:mm:ss)을 'YYYY-MM-DD HH:mm' 로 보기 좋게 자른다.
function formatTransactionAt(transactionAt: string): string {
  const date = transactionAt.slice(0, 10);
  const time = transactionAt.slice(11, 16);
  return time ? `${date} ${time}` : date;
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function BankReviewQueue({ clubId }: BankReviewQueueProps) {
  const {
    data: pendingPage,
    isLoading: isPendingLoading,
    isError: isPendingError,
  } = useBankTransactionsQuery(clubId, { status: 'PENDING' });
  const {
    data: autoMatchedPage,
    isLoading: isAutoMatchedLoading,
    isError: isAutoMatchedError,
  } = useBankTransactionsQuery(clubId, { status: 'AUTO_MATCHED' });

  const pendingTransactions = pendingPage?.content ?? [];
  const matchedTransactions = autoMatchedPage?.content ?? [];

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">검토 대기</h2>
        {isPendingLoading ? (
          <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>
        ) : isPendingError ? (
          <QueryErrorCard />
        ) : pendingTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
            <p className="text-sm text-charcoal-2">검토할 입금 거래가 없습니다.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {pendingTransactions.map((transaction) => (
              <PendingTransactionCard
                key={transaction.id}
                clubId={clubId}
                transaction={transaction}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-ink">자동매칭 내역</h2>
        {isAutoMatchedLoading ? (
          <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>
        ) : isAutoMatchedError ? (
          <QueryErrorCard />
        ) : matchedTransactions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
            <p className="text-sm text-charcoal-2">자동매칭된 거래가 없습니다.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {matchedTransactions.map((transaction) => (
              <MatchedTransactionRow
                key={transaction.id}
                clubId={clubId}
                transaction={transaction}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// 일시적인 조회 실패 시 빈 상태 대신 보여줄 안내 카드. 원본 에러는 노출하지 않는다.
function QueryErrorCard() {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm text-charcoal-2">
        거래를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
      </p>
    </div>
  );
}

type PendingTransactionCardProps = {
  clubId: number;
  transaction: BankTransaction;
};

function PendingTransactionCard({ clubId, transaction }: PendingTransactionCardProps) {
  const approveMatch = useApproveMatchMutation(clubId);
  const ignoreTransaction = useIgnoreTransactionMutation(clubId);
  const { addToast } = useToast();
  const [isIgnoreOpen, setIgnoreOpen] = useState(false);

  const approve = (candidate: MatchCandidate) => {
    approveMatch.mutate(
      { txId: transaction.id, feeBillId: candidate.feeBillId },
      {
        onSuccess: () => addToast('매칭을 승인했습니다.'),
        onError: (error) =>
          addToast(mutationErrorMessage(error, '매칭 승인에 실패했습니다.'), { variant: 'error' }),
      },
    );
  };

  const hasCandidates = transaction.candidates.length > 0;
  const isPending = approveMatch.isPending || ignoreTransaction.isPending;

  return (
    <li className="rounded-xl border border-line px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{formatWon(transaction.amount)}</p>
          <p className="mt-0.5 text-xs text-charcoal-3">
            입금시각 {formatTransactionAt(transaction.transactionAt)}
            {transaction.counterparty && ` · ${transaction.counterparty}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIgnoreOpen(true)}
          disabled={isPending}
          className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
        >
          무시
        </button>
      </div>

      {hasCandidates ? (
        <ul className="mt-3 space-y-2 border-t border-line pt-3">
          {transaction.candidates.map((candidate) => (
            <li
              key={candidate.feeBillId}
              className="flex items-center justify-between gap-4 rounded-md bg-graysoft px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">
                  {candidate.memberName} · {candidate.billingPeriod}
                </p>
                <p className="mt-0.5 text-xs text-charcoal-3">
                  잔액 {formatWon(candidate.remaining)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => approve(candidate)}
                disabled={isPending}
                className="shrink-0 rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper transition-colors hover:bg-ink-deep disabled:opacity-50"
              >
                승인
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 border-t border-line pt-3 text-xs text-charcoal-3">
          일치하는 청구가 없습니다
        </p>
      )}

      {isIgnoreOpen && (
        <IgnoreTransactionConfirm
          transaction={transaction}
          mutation={ignoreTransaction}
          onClose={() => setIgnoreOpen(false)}
        />
      )}
    </li>
  );
}

type IgnoreTransactionConfirmProps = {
  transaction: BankTransaction;
  mutation: ReturnType<typeof useIgnoreTransactionMutation>;
  onClose: () => void;
};

function IgnoreTransactionConfirm({
  transaction,
  mutation,
  onClose,
}: IgnoreTransactionConfirmProps) {
  const { addToast } = useToast();

  const confirmIgnore = () => {
    mutation.mutate(transaction.id, {
      onSuccess: () => {
        addToast('거래를 무시 처리했습니다.');
        onClose();
      },
      onError: (error) => {
        addToast(mutationErrorMessage(error, '무시 처리에 실패했습니다.'), { variant: 'error' });
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="거래 무시 확인"
        className="w-full max-w-sm rounded-xl bg-paper p-5 shadow-3"
      >
        <h2 className="text-base font-bold text-ink">거래 무시</h2>
        <p className="mt-2 text-sm text-charcoal-2">
          <span className="font-medium text-ink">{formatWon(transaction.amount)}</span> 입금 거래를
          무시할까요? 무시한 거래는 검토 큐에서 사라집니다.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 rounded-md border border-line py-2.5 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirmIgnore}
            disabled={mutation.isPending}
            className="flex-1 rounded-md bg-coral py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {mutation.isPending ? '처리 중…' : '무시'}
          </button>
        </div>
      </div>
    </div>
  );
}

type MatchedTransactionRowProps = {
  clubId: number;
  transaction: BankTransaction;
};

function MatchedTransactionRow({ clubId, transaction }: MatchedTransactionRowProps) {
  const unmatchTransaction = useUnmatchTransactionMutation(clubId);
  const { addToast } = useToast();
  const [isUnmatchOpen, setUnmatchOpen] = useState(false);

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{formatWon(transaction.amount)}</p>
        <p className="mt-0.5 text-xs text-charcoal-3">
          입금시각 {formatTransactionAt(transaction.transactionAt)}
          {transaction.counterparty && ` · ${transaction.counterparty}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setUnmatchOpen(true)}
        disabled={unmatchTransaction.isPending}
        className="shrink-0 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-coral transition-colors hover:bg-coral/5 disabled:opacity-50"
      >
        매칭취소
      </button>

      {isUnmatchOpen && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="매칭 취소 확인"
            className="w-full max-w-sm rounded-xl bg-paper p-5 shadow-3"
          >
            <h2 className="text-base font-bold text-ink">매칭 취소</h2>
            <p className="mt-2 text-sm text-charcoal-2">
              <span className="font-medium text-ink">{formatWon(transaction.amount)}</span> 거래의
              매칭을 취소할까요? 연결된 납부 기록이 무효화되고 청구 잔액이 다시 계산됩니다.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setUnmatchOpen(false)}
                disabled={unmatchTransaction.isPending}
                className="flex-1 rounded-md border border-line py-2.5 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={() =>
                  unmatchTransaction.mutate(transaction.id, {
                    onSuccess: () => {
                      addToast('매칭을 취소했습니다.');
                      setUnmatchOpen(false);
                    },
                    onError: (error) => {
                      addToast(mutationErrorMessage(error, '매칭 취소에 실패했습니다.'), {
                        variant: 'error',
                      });
                      setUnmatchOpen(false);
                    },
                  })
                }
                disabled={unmatchTransaction.isPending}
                className="flex-1 rounded-md bg-coral py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
              >
                {unmatchTransaction.isPending ? '취소 중…' : '매칭 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
