'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ApiError } from '@duing/api';
import {
  useClubFeeAccountQuery,
  useDeleteFeeAccountMutation,
  useUpsertFeeAccountMutation,
} from '@duing/hooks';
import { feeAccountSchema } from '@duing/schemas';
import type { FeeAccountInput } from '@duing/schemas';
import { BANKS } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { bankLabel } from '@/app/_lib/feeLabels';

type FeeAccountSectionProps = {
  clubId: number;
};

const inputCls =
  'w-full rounded-md border px-4 py-3 text-sm outline-none transition-colors border-line placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';
const errorInputCls = 'border-coral focus-visible:border-coral focus-visible:ring-coral';

export function FeeAccountSection({ clubId }: FeeAccountSectionProps) {
  const { data: account, isLoading, error } = useClubFeeAccountQuery(clubId);
  const upsertAccount = useUpsertFeeAccountMutation(clubId);
  const { addToast } = useToast();
  const [isDeleteOpen, setDeleteOpen] = useState(false);

  // 미등록(404)은 정상적인 빈 상태다 — 등록 폼을 노출한다. 그 외 오류만 에러로 표시한다.
  const isNotFound = error instanceof ApiError && error.status === 404;
  const loadErrorMessage =
    error && !isNotFound
      ? error instanceof Error
        ? error.message
        : '계좌 정보를 불러오지 못했습니다.'
      : null;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeeAccountInput>({
    resolver: zodResolver(feeAccountSchema),
    // 등록된 계좌가 있으면 편집 기본값으로, 없으면 빈 폼(첫 옵션 은행)으로 시작한다.
    values: account
      ? { bank: account.bank, accountNumber: account.accountNumber, accountHolder: account.accountHolder }
      : { bank: BANKS[0], accountNumber: '', accountHolder: '' },
  });

  const onSubmit = (formData: FeeAccountInput) => {
    upsertAccount.mutate(
      {
        bank: formData.bank,
        accountNumber: formData.accountNumber.trim(),
        accountHolder: formData.accountHolder.trim(),
      },
      {
        onSuccess: () => addToast('회비 계좌를 저장했습니다.'),
        onError: (mutationError) => {
          addToast(
            mutationError instanceof Error ? mutationError.message : '계좌 저장에 실패했습니다.',
            { variant: 'error' },
          );
        },
      },
    );
  };

  if (isLoading) {
    return <p className="p-6 text-sm text-charcoal-3">불러오는 중…</p>;
  }

  if (loadErrorMessage) {
    return (
      <div className="rounded-xl border border-coral/30 bg-coral/5 px-6 py-12 text-center">
        <p className="text-sm text-coral">{loadErrorMessage}</p>
      </div>
    );
  }

  const submitError = upsertAccount.error;
  const submitErrorMessage =
    submitError instanceof ApiError
      ? submitError.message
      : submitError instanceof Error
        ? submitError.message
        : null;

  return (
    <div className="space-y-4">
      {account ? (
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="text-xs font-semibold text-charcoal-3">현재 등록된 계좌</p>
          <p className="mt-1 text-sm font-semibold text-ink">
            {bankLabel(account.bank)} · {account.accountNumber}
          </p>
          <p className="mt-0.5 text-xs text-charcoal-3">예금주 {account.accountHolder}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-line px-6 py-8 text-center">
          <p className="text-sm text-charcoal-2">아직 등록된 회비 계좌가 없습니다.</p>
          <p className="mt-1 text-xs text-charcoal-3">
            동아리원이 회비를 입금할 계좌를 등록해 주세요.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="account-bank" className="mb-1.5 block text-sm font-semibold text-ink">
            은행 <span className="text-coral">*</span>
          </label>
          <select
            id="account-bank"
            aria-label="은행"
            {...register('bank')}
            className={cn(inputCls, errors.bank && errorInputCls)}
          >
            {BANKS.map((option) => (
              <option key={option} value={option}>
                {bankLabel(option)}
              </option>
            ))}
          </select>
          {errors.bank && <p className="mt-1 text-xs text-coral">{errors.bank.message}</p>}
        </div>

        <div>
          <label
            htmlFor="account-number"
            className="mb-1.5 block text-sm font-semibold text-ink"
          >
            계좌번호 <span className="text-coral">*</span>
          </label>
          <input
            id="account-number"
            type="text"
            inputMode="text"
            placeholder="예: 123-456-789012"
            {...register('accountNumber')}
            className={cn(inputCls, errors.accountNumber && errorInputCls)}
          />
          {errors.accountNumber && (
            <p className="mt-1 text-xs text-coral">{errors.accountNumber.message}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="account-holder"
            className="mb-1.5 block text-sm font-semibold text-ink"
          >
            예금주 <span className="text-coral">*</span>
          </label>
          <input
            id="account-holder"
            type="text"
            placeholder="예: 홍길동"
            {...register('accountHolder')}
            className={cn(inputCls, errors.accountHolder && errorInputCls)}
          />
          {errors.accountHolder && (
            <p className="mt-1 text-xs text-coral">{errors.accountHolder.message}</p>
          )}
        </div>

        {submitErrorMessage && (
          <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">{submitErrorMessage}</p>
        )}

        <div className="flex gap-2 pt-1">
          {account && (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              disabled={isSubmitting || upsertAccount.isPending}
              className="rounded-md border border-line px-4 py-3 text-sm font-semibold text-coral transition-colors hover:bg-coral/5 disabled:opacity-50"
            >
              삭제
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting || upsertAccount.isPending}
            className={cn(
              'flex-1 rounded-md py-3 text-sm font-semibold text-paper transition-colors',
              'bg-ink hover:bg-ink-deep',
              (isSubmitting || upsertAccount.isPending) && 'cursor-not-allowed opacity-60',
            )}
          >
            {upsertAccount.isPending ? '저장 중…' : account ? '수정' : '등록하기'}
          </button>
        </div>
      </form>

      {isDeleteOpen && account && (
        <DeleteFeeAccountConfirm
          clubId={clubId}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => reset({ bank: BANKS[0], accountNumber: '', accountHolder: '' })}
        />
      )}
    </div>
  );
}

type DeleteFeeAccountConfirmProps = {
  clubId: number;
  onClose: () => void;
  onDeleted: () => void;
};

function DeleteFeeAccountConfirm({ clubId, onClose, onDeleted }: DeleteFeeAccountConfirmProps) {
  const deleteAccount = useDeleteFeeAccountMutation(clubId);
  const { addToast } = useToast();

  const confirmDelete = () => {
    deleteAccount.mutate(undefined, {
      onSuccess: () => {
        addToast('회비 계좌를 삭제했습니다.');
        onDeleted();
        onClose();
      },
      onError: (error) => {
        addToast(error instanceof Error ? error.message : '계좌 삭제에 실패했습니다.', {
          variant: 'error',
        });
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/40 px-4" role="presentation">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label="회비 계좌 삭제 확인"
        className="w-full max-w-sm rounded-xl bg-paper p-5 shadow-3"
      >
        <h2 className="text-base font-bold text-ink">회비 계좌 삭제</h2>
        <p className="mt-2 text-sm text-charcoal-2">
          등록된 회비 계좌를 삭제할까요? 동아리원이 더 이상 입금 계좌를 확인할 수 없습니다.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleteAccount.isPending}
            className="flex-1 rounded-md border border-line py-2.5 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleteAccount.isPending}
            className="flex-1 rounded-md bg-coral py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-[#c2603f] disabled:opacity-50"
          >
            {deleteAccount.isPending ? '삭제 중…' : '삭제'}
          </button>
        </div>
      </div>
    </div>
  );
}
