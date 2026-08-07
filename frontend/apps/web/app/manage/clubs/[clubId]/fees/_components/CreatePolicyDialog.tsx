'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ApiError } from '@duing/api';
import { useCreateFeePolicyMutation, useUpdateFeePolicyMutation } from '@duing/hooks';
import { createFeePolicySchema } from '@duing/schemas';
import type { CreateFeePolicyInput } from '@duing/schemas';
import type {
  BillingType,
  CreateFeePolicyPayload,
  FeePolicy,
  UpdateFeePolicyPayload,
} from '@duing/types';

import { cn } from '@/app/_lib/cn';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import { billingTypeLabel } from '@/app/_lib/feeLabels';
import { ButtonSpinner } from '@/components/loading/Spinner';

type CreatePolicyDialogProps = {
  clubId: number;
  // 수정 모드일 때 대상 정책. 미지정이면 생성 모드.
  policy?: FeePolicy;
  onClose: () => void;
};

const BILLING_TYPE_OPTIONS: BillingType[] = ['MONTHLY', 'SEMESTER', 'YEARLY', 'ONE_TIME'];

const inputCls =
  'w-full rounded-md border px-4 py-3 text-sm outline-none transition-colors border-line placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';
const errorInputCls = 'border-coral focus-visible:border-coral focus-visible:ring-coral';

export function CreatePolicyDialog({ clubId, policy, onClose }: CreatePolicyDialogProps) {
  const isEditMode = policy !== undefined;
  const createPolicy = useCreateFeePolicyMutation(clubId);
  const updatePolicy = useUpdateFeePolicyMutation(clubId);
  const activeMutation = isEditMode ? updatePolicy : createPolicy;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateFeePolicyInput>({
    resolver: zodResolver(createFeePolicySchema),
    defaultValues: policy
      ? {
          name: policy.name,
          amount: policy.amount,
          billingType: policy.billingType,
          targetType: policy.targetType,
          autoIssue: policy.autoIssue,
          issueDay: policy.issueDay ?? undefined,
          dueDay: policy.dueDay ?? undefined,
        }
      : {
          name: '',
          amount: 0,
          billingType: 'MONTHLY',
          targetType: 'ALL_MEMBERS',
          autoIssue: false,
          issueDay: undefined,
          dueDay: undefined,
        },
  });

  // 자동발행은 전체 회원 MONTHLY 정책만. 생성 모드는 선택 중인 값, 수정 모드는 (잠긴) 기존 값을 본다.
  const watchedBillingType = watch('billingType');
  const watchedAutoIssue = watch('autoIssue');
  const watchedTargetType = watch('targetType');
  const effectiveBillingType = isEditMode ? policy.billingType : watchedBillingType;
  const effectiveTargetType = isEditMode ? policy.targetType : watchedTargetType;
  const showAutoIssue = effectiveBillingType === 'MONTHLY' && effectiveTargetType === 'ALL_MEMBERS';

  const onSubmit = (formData: CreateFeePolicyInput) => {
    if (isEditMode) {
      // billingType 은 수정 모드에서 읽기 전용이므로 와이어에 싣지 않는다(보수적 잠금).
      // autoIssue=true 면 백엔드 검증을 위해 issueDay/dueDay 를 항상 함께 보낸다.
      const payload: UpdateFeePolicyPayload = {
        name: formData.name.trim(),
        amount: formData.amount,
        autoIssue: formData.autoIssue,
      };
      if (formData.autoIssue) {
        payload.issueDay = formData.issueDay;
        payload.dueDay = formData.dueDay;
      }
      updatePolicy.mutate({ policyId: policy.id, payload }, { onSuccess: onClose });
      return;
    }
    const payload: CreateFeePolicyPayload = {
      name: formData.name.trim(),
      amount: formData.amount,
      billingType: formData.billingType,
      targetType: formData.targetType,
      autoIssue: formData.autoIssue,
    };
    if (formData.autoIssue) {
      payload.issueDay = formData.issueDay;
      payload.dueDay = formData.dueDay;
    }
    createPolicy.mutate(payload, { onSuccess: onClose });
  };

  const submitError = activeMutation.error;
  const submitErrorMessage =
    submitError instanceof ApiError
      ? submitError.message
      : submitError instanceof Error
        ? submitError.message
        : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !activeMutation.isPending) onClose();
      }}
    >
      <DialogContent busy={isSubmitting || activeMutation.isPending} className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? '회비 정책 수정' : '회비 정책 추가'}</DialogTitle>
          <DialogDescription className="text-sm text-charcoal-2">
            {isEditMode
              ? '정책 이름과 금액을 수정할 수 있습니다.'
              : '회비 정책의 이름·금액·유형을 입력하세요.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="policy-name" className="mb-1.5 block text-sm font-semibold text-ink">
              정책 이름 <span className="text-coral">*</span>
            </label>
            <input
              id="policy-name"
              type="text"
              placeholder="예: 2026 상반기 월 회비"
              {...register('name')}
              className={cn(inputCls, errors.name && errorInputCls)}
            />
            {errors.name && <p className="mt-1 text-xs text-coral">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="policy-amount" className="mb-1.5 block text-sm font-semibold text-ink">
              금액(원) <span className="text-coral">*</span>
            </label>
            <input
              id="policy-amount"
              type="number"
              min={0}
              step={1}
              placeholder="10000"
              {...register('amount')}
              className={cn(inputCls, errors.amount && errorInputCls)}
            />
            {isEditMode && (
              <p className="mt-1 text-xs text-charcoal-3">기존 발행 청구액은 바뀌지 않습니다.</p>
            )}
            {errors.amount && <p className="mt-1 text-xs text-coral">{errors.amount.message}</p>}
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink">회비 유형</span>
            {isEditMode ? (
              <p
                className="rounded-md border border-line bg-graysoft px-4 py-3 text-sm text-charcoal-2"
                aria-readonly="true"
              >
                {billingTypeLabel(policy.billingType)}
                <span className="ml-2 text-xs text-charcoal-3">
                  (유형은 변경할 수 없습니다. 변경하려면 새 정책을 만드세요.)
                </span>
              </p>
            ) : (
              <select
                id="policy-billing-type"
                aria-label="회비 유형"
                {...register('billingType', {
                  onChange: (event) => {
                    if (event.target.value !== 'MONTHLY') {
                      setValue('autoIssue', false);
                      setValue('issueDay', undefined);
                      setValue('dueDay', undefined);
                    }
                  },
                })}
                className={cn(inputCls, errors.billingType && errorInputCls)}
              >
                {BILLING_TYPE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {billingTypeLabel(option)}
                  </option>
                ))}
              </select>
            )}
            {errors.billingType && (
              <p className="mt-1 text-xs text-coral">{errors.billingType.message}</p>
            )}
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink">청구 대상</span>
            {isEditMode ? (
              <p
                className="rounded-md border border-line bg-graysoft px-4 py-3 text-sm text-charcoal-2"
                aria-readonly="true"
              >
                {policy.targetType === 'SELECTED_MEMBERS' ? '특정 회원' : '전체 회원'}
                <span className="ml-2 text-xs text-charcoal-3">
                  (청구 대상은 변경할 수 없습니다. 변경하려면 새 정책을 만드세요.)
                </span>
              </p>
            ) : (
              <div className="flex gap-2">
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-3 text-sm">
                  <input
                    type="radio"
                    value="ALL_MEMBERS"
                    {...register('targetType', {
                      onChange: () => {
                        setValue('autoIssue', false);
                        setValue('issueDay', undefined);
                        setValue('dueDay', undefined);
                      },
                    })}
                    className="accent-ink"
                  />
                  전체 회원
                </label>
                <label className="flex flex-1 cursor-pointer items-center gap-2 rounded-md border border-line px-4 py-3 text-sm">
                  <input
                    type="radio"
                    value="SELECTED_MEMBERS"
                    {...register('targetType', {
                      onChange: () => {
                        setValue('autoIssue', false);
                        setValue('issueDay', undefined);
                        setValue('dueDay', undefined);
                      },
                    })}
                    className="accent-ink"
                  />
                  특정 회원
                </label>
              </div>
            )}
            <p className="mt-1 text-xs text-charcoal-3">
              특정 회원은 발행할 때마다 대상 회원을 선택합니다(MT·행사 참가비 등).
            </p>
            {errors.targetType && <p className="mt-1 text-xs text-coral">{errors.targetType.message}</p>}
          </div>

          {showAutoIssue && (
            <div className="rounded-md border border-line p-3">
              <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                <input type="checkbox" {...register('autoIssue')} className="h-4 w-4 accent-ink" />
                매월 자동 발행
              </label>
              <p className="mt-1 text-xs text-charcoal-3">
                매월 발행일이 되면 활성 회원에게 이 정책의 청구를 자동으로 발행합니다.
              </p>
              {watchedAutoIssue && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="policy-issue-day" className="mb-1 block text-xs font-semibold text-charcoal-2">
                      발행일(1~28)
                    </label>
                    <input
                      id="policy-issue-day"
                      type="number"
                      min={1}
                      max={28}
                      placeholder="5"
                      {...register('issueDay')}
                      className={cn(inputCls, errors.issueDay && errorInputCls)}
                    />
                    {errors.issueDay && (
                      <p className="mt-1 text-xs text-coral">{errors.issueDay.message}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="policy-due-day" className="mb-1 block text-xs font-semibold text-charcoal-2">
                      마감일(1~28)
                    </label>
                    <input
                      id="policy-due-day"
                      type="number"
                      min={1}
                      max={28}
                      placeholder="20"
                      {...register('dueDay')}
                      className={cn(inputCls, errors.dueDay && errorInputCls)}
                    />
                    {errors.dueDay && <p className="mt-1 text-xs text-coral">{errors.dueDay.message}</p>}
                  </div>
                </div>
              )}
              {errors.autoIssue && <p className="mt-1 text-xs text-coral">{errors.autoIssue.message}</p>}
            </div>
          )}

          {submitErrorMessage && (
            <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">{submitErrorMessage}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || activeMutation.isPending}
              className="flex-1 rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || activeMutation.isPending}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-3 text-sm font-semibold text-paper transition-colors',
                'bg-ink hover:bg-ink-deep',
                (isSubmitting || activeMutation.isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {activeMutation.isPending && <ButtonSpinner />}
              {isEditMode ? '수정' : '추가'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
