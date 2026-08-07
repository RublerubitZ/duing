'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ApiError } from '@duing/api';
import { useBankSyncMutation } from '@duing/hooks';
import { syncBankTransactionsSchema } from '@duing/schemas';
import type { SyncBankTransactionsInput } from '@duing/schemas';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type BankSyncDialogProps = {
  clubId: number;
  bankLabel: string;
  onClose: () => void;
};

const inputCls =
  'w-full rounded-md border px-4 py-3 text-sm outline-none transition-colors border-line placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';
const errorInputCls = 'border-coral focus-visible:border-coral focus-visible:ring-coral';

// 동기화 실패 ApiError → 사용자 안내 메시지. 429(요청 한도)·502/BANK 연동 장애는 정형 문구로,
// 403(권한/미사용)은 서버 메시지를 그대로 노출한다. 그 외는 서버 메시지 또는 일반 문구.
function syncErrorMessage(error: unknown): string | null {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return '잠시 후 다시 시도해 주세요(요청 한도)';
    }
    if (error.status === 403) {
      return error.message;
    }
    if (error.status === 502) {
      return '은행 연동에 일시적으로 실패했습니다';
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return null;
}

export function BankSyncDialog({ clubId, bankLabel, onClose }: BankSyncDialogProps) {
  const syncTransactions = useBankSyncMutation(clubId);
  const { addToast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SyncBankTransactionsInput>({
    resolver: zodResolver(syncBankTransactionsSchema),
    defaultValues: { accountPassword: '', residentNumber: '' },
  });

  // 민감 인증정보(계좌 비번·주민번호)는 폼 상태로만 잠시 머문다 —
  // 성공/닫기 어느 경로든 reset() 으로 즉시 비워 메모리에 남기지 않는다.
  const closeAndClear = () => {
    reset();
    onClose();
  };

  const onSubmit = (formData: SyncBankTransactionsInput) => {
    syncTransactions.mutate(formData, {
      onSuccess: (result) => {
        addToast(
          `동기화 완료 — ${result.newlyStored}건 적재 · ${result.autoMatched}건 자동매칭 · ${result.pendingReview}건 검토 필요`,
        );
        closeAndClear();
      },
    });
  };

  const submitErrorMessage = syncErrorMessage(syncTransactions.error);
  const isPending = isSubmitting || syncTransactions.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && closeAndClear()}>
      <DialogContent busy={isPending} className="max-w-md">
        <DialogHeader>
          <DialogTitle>거래내역 동기화</DialogTitle>
          <DialogDescription className="text-sm text-charcoal-2">
            등록된 회비 계좌의 거래내역을 불러와 청구와 자동으로 매칭합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Field id="bank-sync-bank" label="은행">
            <p
              id="bank-sync-bank"
              className="w-full rounded-md border border-line bg-graysoft px-4 py-3 text-sm text-charcoal-2"
            >
              {bankLabel}
            </p>
          </Field>

          <Field
            id="bank-sync-password"
            label="계좌 비밀번호"
            required
            error={errors.accountPassword?.message}
          >
            <input
              id="bank-sync-password"
              type="password"
              autoComplete="off"
              {...register('accountPassword')}
              className={cn(inputCls, errors.accountPassword && errorInputCls)}
            />
          </Field>

          <Field
            id="bank-sync-resident"
            label="주민등록번호 앞 6자리"
            required
            error={errors.residentNumber?.message}
          >
            <input
              id="bank-sync-resident"
              type="password"
              inputMode="numeric"
              maxLength={6}
              autoComplete="off"
              {...register('residentNumber')}
              className={cn(inputCls, errors.residentNumber && errorInputCls)}
            />
          </Field>

          <p className="rounded-md bg-graysoft px-4 py-3 text-xs text-charcoal-3">
            입력한 인증정보는 거래 조회에만 쓰이며 저장되지 않습니다.
          </p>

          {submitErrorMessage && (
            <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">{submitErrorMessage}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={closeAndClear}
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
              {syncTransactions.isPending && <ButtonSpinner />}동기화
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
