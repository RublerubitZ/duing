'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ApiError } from '@duing/api';
import { useRecordPaymentMutation } from '@duing/hooks';
import { recordPaymentSchema } from '@duing/schemas';
import type { RecordPaymentInput } from '@duing/schemas';
import type { FeeBill } from '@duing/types';

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
import { ButtonSpinner } from '@/components/loading/Spinner';

type RecordPaymentDialogProps = {
  clubId: number;
  bill: FeeBill;
  memberName: string;
  onClose: () => void;
};

const inputCls =
  'w-full rounded-md border px-4 py-3 text-sm outline-none transition-colors border-line placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';
const errorInputCls = 'border-coral focus-visible:border-coral focus-visible:ring-coral';

// 수동 기록 가능한 납부 수단(AUTO_MATCHED 제외) — 스키마 enum 과 동일 순서.
const METHOD_OPTIONS: RecordPaymentInput['method'][] = ['CASH', 'TRANSFER', 'OTHER'];

// 오늘 날짜를 LOCAL 기준 YYYY-MM-DD 로 만든다(toISOString 은 UTC 라 KST 에서 하루 어긋날 수 있음).
function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function RecordPaymentDialog({
  clubId,
  bill,
  memberName,
  onClose,
}: RecordPaymentDialogProps) {
  const recordPayment = useRecordPaymentMutation(clubId, bill.id);
  const { addToast } = useToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      amount: bill.remainingAmount,
      method: 'CASH',
      paidAt: todayLocalDate(),
      memo: '',
    },
  });

  const onSubmit = (formData: RecordPaymentInput) => {
    recordPayment.mutate(formData, {
      onSuccess: () => {
        addToast('납부를 기록했습니다.');
        onClose();
      },
    });
  };

  const submitError = recordPayment.error;
  const submitErrorMessage =
    submitError instanceof ApiError
      ? submitError.message
      : submitError instanceof Error
        ? submitError.message
        : null;

  const isPending = isSubmitting || recordPayment.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent busy={isPending} className="max-w-md">
        <DialogHeader>
          <DialogTitle>납부 기록</DialogTitle>
          <DialogDescription className="text-sm text-charcoal-2">
            {memberName} · {bill.billingPeriod} 청구에 납부 내역을 기록합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field id="payment-amount" label="납부 금액" required error={errors.amount?.message}>
            <input
              id="payment-amount"
              type="number"
              {...register('amount')}
              className={cn(inputCls, errors.amount && errorInputCls)}
            />
            <p className="mt-1 text-xs text-charcoal-3">
              남은 미납액 {formatWon(bill.remainingAmount)}
            </p>
          </Field>

          <Field id="payment-method" label="납부 수단" required error={errors.method?.message}>
            <select
              id="payment-method"
              {...register('method')}
              className={cn(inputCls, errors.method && errorInputCls)}
            >
              {METHOD_OPTIONS.map((method) => (
                <option key={method} value={method}>
                  {paymentMethodLabel(method)}
                </option>
              ))}
            </select>
          </Field>

          <Field id="payment-paid-at" label="납부일" required error={errors.paidAt?.message}>
            <input
              id="payment-paid-at"
              type="date"
              {...register('paidAt')}
              className={cn(inputCls, errors.paidAt && errorInputCls)}
            />
          </Field>

          <Field id="payment-memo" label="메모 (선택)" error={errors.memo?.message}>
            <input
              id="payment-memo"
              type="text"
              placeholder="예: 5월 현금 납부"
              {...register('memo')}
              className={cn(inputCls, errors.memo && errorInputCls)}
            />
          </Field>

          {submitErrorMessage && (
            <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">{submitErrorMessage}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isPending}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-3 text-sm font-semibold text-paper transition-colors',
                'bg-ink hover:bg-ink-deep',
                isPending && 'cursor-not-allowed opacity-60',
              )}
            >
              {recordPayment.isPending && <ButtonSpinner />}기록
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type FieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
};

function Field({ id, label, required, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label} {required && <span className="text-coral">*</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}
