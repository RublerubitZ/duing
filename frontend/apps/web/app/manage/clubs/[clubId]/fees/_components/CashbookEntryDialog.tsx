'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ApiError } from '@duing/api';
import { useCreateCashbookEntryMutation, useUpdateCashbookEntryMutation } from '@duing/hooks';
import { createCashbookEntrySchema } from '@duing/schemas';
import type { CreateCashbookEntryInput } from '@duing/schemas';
import type {
  CashbookCategory,
  CashbookEntry,
  CashbookEntryType,
  CreateCashbookEntryPayload,
  UpdateCashbookEntryPayload,
} from '@duing/types';

import { cn } from '@/app/_lib/cn';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cashbookCategoryLabel } from '@/app/_lib/feeLabels';
import { ButtonSpinner } from '@/components/loading/Spinner';

const INCOME_CODES: CashbookCategory[] = ['FEE', 'SPONSOR', 'SUBSIDY', 'OTHER'];
const EXPENSE_CODES: CashbookCategory[] = ['MT', 'DINING', 'SNACK', 'SUPPLY', 'MARKETING', 'OTHER'];

const inputCls =
  'w-full rounded-md border border-line px-4 py-3 text-sm outline-none transition-colors placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';
const errorInputCls = 'border-coral focus-visible:border-coral focus-visible:ring-coral';

// 오늘 날짜를 LOCAL 기준 YYYY-MM-DD 로 만든다(toISOString 은 UTC 라 KST 에서 하루 어긋날 수 있음).
function todayLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type CashbookEntryDialogProps = {
  clubId: number;
  // 등록 모드에서 결정되는 유형(수입/지출). 수정 모드면 entry 로 대체.
  entryType: CashbookEntryType;
  entry?: CashbookEntry;
  onClose: () => void;
};

export function CashbookEntryDialog({ clubId, entryType, entry, onClose }: CashbookEntryDialogProps) {
  const isEditMode = entry !== undefined;
  const isBankApi = entry?.source === 'BANK_API';
  const effectiveType: CashbookEntryType = isEditMode ? entry.entryType : entryType;
  const codes = effectiveType === 'INCOME' ? INCOME_CODES : EXPENSE_CODES;

  const createEntry = useCreateCashbookEntryMutation(clubId);
  const updateEntry = useUpdateCashbookEntryMutation(clubId);
  const activeMutation = isEditMode ? updateEntry : createEntry;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateCashbookEntryInput>({
    resolver: zodResolver(createCashbookEntrySchema),
    defaultValues: entry
      ? {
          entryType: entry.entryType,
          categoryCode: entry.categoryCode,
          customCategory: entry.customCategory ?? undefined,
          amount: entry.amount,
          description: entry.description,
          transactionDate: entry.transactionDate,
          memo: entry.memo ?? undefined,
        }
      : {
          entryType,
          categoryCode: codes[0],
          customCategory: undefined,
          amount: 0,
          description: '',
          transactionDate: todayLocalDate(),
          memo: undefined,
        },
  });

  const watchedCategory = watch('categoryCode');

  const onSubmit = (formData: CreateCashbookEntryInput) => {
    const customCategory =
      formData.categoryCode === 'OTHER' && formData.customCategory
        ? formData.customCategory
        : undefined;
    if (isEditMode) {
      const payload: UpdateCashbookEntryPayload = { categoryCode: formData.categoryCode, customCategory };
      if (!isBankApi) {
        payload.amount = formData.amount;
        payload.description = formData.description.trim();
        payload.transactionDate = formData.transactionDate;
      }
      payload.memo = formData.memo?.trim() || undefined;
      updateEntry.mutate({ entryId: entry.id, payload }, { onSuccess: onClose });
      return;
    }
    const payload: CreateCashbookEntryPayload = {
      entryType: effectiveType,
      categoryCode: formData.categoryCode,
      customCategory,
      amount: formData.amount,
      description: formData.description.trim(),
      transactionDate: formData.transactionDate,
      memo: formData.memo?.trim() || undefined,
    };
    createEntry.mutate(payload, { onSuccess: onClose });
  };

  const submitError = activeMutation.error;
  const submitErrorMessage = submitError instanceof ApiError ? submitError.message : null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isSubmitting && !activeMutation.isPending) onClose(); }}>
      <DialogContent busy={isSubmitting || activeMutation.isPending} className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? '장부 항목 수정' : effectiveType === 'INCOME' ? '수입 등록' : '지출 등록'}
          </DialogTitle>
          <DialogDescription className="text-sm text-charcoal-2">
            {isBankApi
              ? 'BANK 자동 생성 항목은 카테고리·메모만 수정할 수 있습니다.'
              : '카테고리·금액·설명·거래일을 입력하세요.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <input type="hidden" {...register('entryType')} />

          <div>
            <label htmlFor="cb-category" className="mb-1.5 block text-sm font-semibold text-ink">카테고리</label>
            <select id="cb-category" {...register('categoryCode')} className={cn(inputCls, errors.categoryCode && errorInputCls)}>
              {codes.map((code) => (
                <option key={code} value={code}>{cashbookCategoryLabel(code)}</option>
              ))}
            </select>
            {errors.categoryCode && <p className="mt-1 text-xs text-coral">{errors.categoryCode.message}</p>}
          </div>

          {watchedCategory === 'OTHER' && (
            <div>
              <label htmlFor="cb-custom" className="mb-1.5 block text-sm font-semibold text-ink">직접입력</label>
              <input id="cb-custom" type="text" placeholder="예: 현수막 제작" {...register('customCategory')} className={cn(inputCls, errors.customCategory && errorInputCls)} />
              {errors.customCategory && <p className="mt-1 text-xs text-coral">{errors.customCategory.message}</p>}
            </div>
          )}

          <div>
            <label htmlFor="cb-amount" className="mb-1.5 block text-sm font-semibold text-ink">금액(원)</label>
            <input id="cb-amount" type="number" min={1} step={1} {...register('amount')} disabled={isBankApi} className={cn(inputCls, errors.amount && errorInputCls, isBankApi && 'bg-graysoft text-charcoal-3')} />
            {errors.amount && <p className="mt-1 text-xs text-coral">{errors.amount.message}</p>}
          </div>

          <div>
            <label htmlFor="cb-desc" className="mb-1.5 block text-sm font-semibold text-ink">설명</label>
            <input id="cb-desc" type="text" placeholder="예: MT 버스비" {...register('description')} disabled={isBankApi} className={cn(inputCls, errors.description && errorInputCls, isBankApi && 'bg-graysoft text-charcoal-3')} />
            {errors.description && <p className="mt-1 text-xs text-coral">{errors.description.message}</p>}
          </div>

          <div>
            <label htmlFor="cb-date" className="mb-1.5 block text-sm font-semibold text-ink">거래일</label>
            <input id="cb-date" type="date" {...register('transactionDate')} disabled={isBankApi} className={cn(inputCls, errors.transactionDate && errorInputCls, isBankApi && 'bg-graysoft text-charcoal-3')} />
            {errors.transactionDate && <p className="mt-1 text-xs text-coral">{errors.transactionDate.message}</p>}
          </div>

          <div>
            <label htmlFor="cb-memo" className="mb-1.5 block text-sm font-semibold text-ink">메모(선택)</label>
            <input id="cb-memo" type="text" {...register('memo')} className={inputCls} />
            {errors.memo && <p className="mt-1 text-xs text-coral">{errors.memo.message}</p>}
          </div>

          {submitErrorMessage && (
            <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">{submitErrorMessage}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={isSubmitting || activeMutation.isPending} className="flex-1 rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50">취소</button>
            <button type="submit" disabled={isSubmitting || activeMutation.isPending} className={cn('inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-3 text-sm font-semibold text-paper transition-colors bg-ink hover:bg-ink-deep', (isSubmitting || activeMutation.isPending) && 'cursor-not-allowed opacity-60')}>
              {activeMutation.isPending && <ButtonSpinner />}
              {isEditMode ? '수정' : '등록'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
