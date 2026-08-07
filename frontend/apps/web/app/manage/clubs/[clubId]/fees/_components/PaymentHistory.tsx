'use client';

import { useEffect, useState } from 'react';

import { formatDateKst, useBillPaymentsQuery, useVoidPaymentMutation } from '@duing/hooks';
import type { FeeBill, Payment } from '@duing/types';

import { useBackDismiss } from '@/app/_lib/backDismiss';
import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import { formatWon, paymentMethodLabel } from '@/app/_lib/feeLabels';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';

type PaymentHistoryProps = {
  clubId: number;
  bill: FeeBill;
  memberName: string;
  onClose: () => void;
};

export function PaymentHistory({ clubId, bill, memberName, onClose }: PaymentHistoryProps) {
  const { data: payments, isLoading } = useBillPaymentsQuery(clubId, bill.id);
  const [voidTarget, setVoidTarget] = useState<Payment | null>(null);
  // 무효화 요청은 확인 컴포넌트가 들고 있어 pending 이 여기 스코프에 없다 — 전송 중 ESC·바깥
  // 클릭으로 내역 다이얼로그째 닫히는 것을 막으려면 DialogContent 계층으로 올려야 한다.
  const [voiding, setVoiding] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && !voiding && onClose()}>
      <DialogContent busy={voiding} className="max-w-md">
        <DialogHeader>
          <DialogTitle>납부 내역 · {memberName}</DialogTitle>
          <DialogDescription className="text-sm text-charcoal-2">
            {bill.billingPeriod} 청구의 납부 기록입니다. 취소된 기록도 함께 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <LoadingGate label="납부 내역 불러오는 중" className="min-h-0 py-8" />
        ) : !payments || payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
            <p className="text-sm text-charcoal-2">기록된 납부가 없습니다.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {payments.map((payment) => (
              <PaymentRow
                key={payment.id}
                payment={payment}
                onVoid={() => setVoidTarget(payment)}
              />
            ))}
          </ul>
        )}

        {/* 무효화 확인은 Radix 포털(DialogContent) 안에 두어 focus-trap/aria-hidden 바깥으로
            밀려나지 않게 한다 — 바깥에 두면 alertdialog 가 aria-hidden 처리되어 접근 불가. */}
        {voidTarget && (
          <VoidPaymentConfirm
            clubId={clubId}
            billId={bill.id}
            payment={voidTarget}
            onClose={() => setVoidTarget(null)}
            onVoidingChange={setVoiding}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type PaymentRowProps = {
  payment: Payment;
  onVoid: () => void;
};

function PaymentRow({ payment, onVoid }: PaymentRowProps) {
  const isVoided = payment.status === 'VOIDED';

  return (
    <li className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate text-sm font-semibold',
              isVoided ? 'text-charcoal-3 line-through' : 'text-ink',
            )}
          >
            {formatWon(payment.amount)}
          </p>
          {isVoided && (
            <span className="shrink-0 rounded-full bg-graysoft px-2 py-0.5 text-[11px] font-medium text-charcoal-3">
              취소됨
            </span>
          )}
        </div>
        <p
          className={cn(
            'mt-0.5 text-xs',
            isVoided ? 'text-charcoal-3 line-through' : 'text-charcoal-3',
          )}
        >
          {paymentMethodLabel(payment.method)} · 납부일 {formatDateKst(payment.paidAt)}
        </p>
        {isVoided && payment.voidReason && (
          <p className="mt-0.5 text-xs text-charcoal-2">사유: {payment.voidReason}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!isVoided && (
          <button
            type="button"
            onClick={onVoid}
            className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-coral transition-colors hover:bg-coral/5"
          >
            취소
          </button>
        )}
      </div>
    </li>
  );
}

type VoidPaymentConfirmProps = {
  clubId: number;
  billId: number;
  payment: Payment;
  onClose: () => void;
  onVoidingChange: (voiding: boolean) => void;
};

function VoidPaymentConfirm({
  clubId,
  billId,
  payment,
  onClose,
  onVoidingChange,
}: VoidPaymentConfirmProps) {
  const voidPayment = useVoidPaymentMutation(clubId, billId);
  // 전송 중 뒤로가기로 확인 UI 가 닫히면 취소된 것으로 오해한다 — ESC·바깥 클릭과 같은 기준으로 막는다.
  // 핸들러를 null 로 떼면 훅이 엔트리를 회수했다가 다시 쌓아 히스토리 왕복이 늘어난다.
  // 엔트리는 유지한 채 안에서 거부해야 훅이 준비해 둔 재push 경로를 탄다.
  useBackDismiss(true, () => {
    if (!voidPayment.isPending) onClose();
  });
  const { addToast } = useToast();
  const [reason, setReason] = useState('');

  // 전송 중임을 부모(DialogContent)에 알린다. 언마운트 해제가 없으면 확인 UI 가 사라진 뒤에도
  // 내역 다이얼로그가 잠긴 채로 남는다 — 정리를 반드시 함께 둔다.
  const voiding = voidPayment.isPending;
  useEffect(() => {
    onVoidingChange(voiding);
    return () => onVoidingChange(false);
  }, [voiding, onVoidingChange]);

  const confirmVoid = () => {
    const trimmedReason = reason.trim();
    voidPayment.mutate(
      { paymentId: payment.id, reason: trimmedReason ? trimmedReason : undefined },
      {
        onSuccess: () => {
          addToast('납부 기록을 취소했습니다.');
          onClose();
        },
        onError: (error) => {
          addToast(error instanceof Error ? error.message : '납부 기록 취소에 실패했습니다.', {
            variant: 'error',
          });
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/40 px-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="납부 기록 취소 확인"
        className="w-full max-w-sm rounded-xl bg-paper p-5 shadow-3"
      >
        <h2 className="text-base font-bold text-ink">납부 기록 취소</h2>
        <p className="mt-2 text-sm text-charcoal-2">
          <span className="font-medium text-ink">{formatWon(payment.amount)}</span> 납부 기록을
          취소할까요? 취소하면 청구 잔액과 수납 현황이 다시 계산됩니다.
        </p>
        <div className="mt-3">
          <label htmlFor="void-reason" className="mb-1.5 block text-sm font-semibold text-ink">
            취소 사유 (선택)
          </label>
          <input
            id="void-reason"
            type="text"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="예: 중복 기록"
            className="w-full rounded-md border border-line px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink"
          />
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={voidPayment.isPending}
            className="flex-1 rounded-md border border-line py-2.5 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={confirmVoid}
            disabled={voidPayment.isPending}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-coral py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {voidPayment.isPending && <ButtonSpinner />}기록 취소
          </button>
        </div>
      </div>
    </div>
  );
}
