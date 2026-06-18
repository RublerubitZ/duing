'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { ApiError } from '@duing/api';
import {
  useClubFeePoliciesQuery,
  useClubMembersQuery,
  useGenerateBillsMutation,
} from '@duing/hooks';
import { generateBillsSchema, toGenerateBillsPayload } from '@duing/schemas';
import type { GenerateBillsInput } from '@duing/schemas';
import type { FeePolicy, GenerateBillsPayload } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import { billingTypeLabel } from '@/app/_lib/feeLabels';

type GenerateBillsDialogProps = {
  clubId: number;
  onClose: () => void;
};

const inputCls =
  'w-full rounded-md border px-4 py-3 text-sm outline-none transition-colors border-line placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';
const errorInputCls = 'border-coral focus-visible:border-coral focus-visible:ring-coral';

export function GenerateBillsDialog({ clubId, onClose }: GenerateBillsDialogProps) {
  const { data: policies, isLoading } = useClubFeePoliciesQuery(clubId);
  const [selectedPolicy, setSelectedPolicy] = useState<FeePolicy | null>(null);

  const activePolicies = (policies ?? []).filter((policy) => policy.active);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>회비 청구 발행</DialogTitle>
          <DialogDescription className="text-sm text-charcoal-2">
            정책을 선택하고 회차·기간을 입력해 청구서를 발행합니다. 특정 회원 정책은 대상 회원을 선택합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label htmlFor="generate-policy" className="mb-1.5 block text-sm font-semibold text-ink">
              회비 정책 <span className="text-coral">*</span>
            </label>
            {isLoading ? (
              <p className="text-sm text-charcoal-3">정책을 불러오는 중…</p>
            ) : activePolicies.length === 0 ? (
              <p className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-charcoal-2">
                발행할 수 있는 활성 정책이 없습니다. 먼저 정책 탭에서 정책을 만들거나 활성화하세요.
              </p>
            ) : (
              <select
                id="generate-policy"
                aria-label="회비 정책 선택"
                value={selectedPolicy?.id ?? ''}
                onChange={(event) => {
                  const nextId = Number(event.target.value);
                  setSelectedPolicy(
                    activePolicies.find((policy) => policy.id === nextId) ?? null,
                  );
                }}
                className={inputCls}
              >
                <option value="" disabled>
                  정책을 선택하세요
                </option>
                {activePolicies.map((policy) => (
                  <option key={policy.id} value={policy.id}>
                    {policy.name} ({billingTypeLabel(policy.billingType)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedPolicy && (
            // key 로 정책 변경 시 폼을 리마운트해 billingType 분기·기본값을 새로 잡는다.
            <GenerateBillsForm
              key={selectedPolicy.id}
              clubId={clubId}
              policy={selectedPolicy}
              onClose={onClose}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type GenerateBillsFormProps = {
  clubId: number;
  policy: FeePolicy;
  onClose: () => void;
};

function GenerateBillsForm({ clubId, policy, onClose }: GenerateBillsFormProps) {
  const generateBills = useGenerateBillsMutation(clubId);
  const { addToast } = useToast();

  const isSelected = policy.targetType === 'SELECTED_MEMBERS';
  const { data: members, isLoading: membersLoading } = useClubMembersQuery(
    isSelected ? clubId : undefined,
  );
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [memberError, setMemberError] = useState<string | null>(null);

  const toggleMember = (userId: number) => {
    setMemberError(null);
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  // discriminant(billingType)는 사용자 입력이 아니라 선택 정책의 유형으로 고정한다.
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GenerateBillsInput>({
    resolver: zodResolver(generateBillsSchema),
    defaultValues: defaultValuesFor(policy.billingType),
  });

  const onSubmit = (formData: GenerateBillsInput) => {
    if (isSelected && selectedUserIds.length === 0) {
      setMemberError('청구할 회원을 1명 이상 선택해 주세요.');
      return;
    }
    const payload: GenerateBillsPayload = {
      ...toGenerateBillsPayload(formData),
      ...(isSelected ? { memberIds: selectedUserIds } : {}),
    };
    generateBills.mutate(
      { policyId: policy.id, payload },
      {
        onSuccess: (result) => {
          // created=0 이어도(동시 발행) 훅이 청구 목록을 무효화하므로 응답값만으로 성공 안내만 한다(§9).
          const skippedNote =
            result.skippedUserIds.length > 0 ? ` · 제외 ${result.skippedUserIds.length}` : '';
          addToast(`발행 완료 (신규 ${result.created}${skippedNote})`);
          onClose();
        },
      },
    );
  };

  const submitError = generateBills.error;
  const submitErrorMessage =
    submitError instanceof ApiError
      ? submitError.message
      : submitError instanceof Error
        ? submitError.message
        : null;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {/* discriminant(billingType)는 사용자 입력이 아니라 defaultValues 로 선택 정책 유형이 고정되며,
          hidden 으로 register 해 제출 데이터에 포함되도록만 한다(폼은 정책별 key 로 리마운트됨). */}
      <input type="hidden" {...register('billingType')} />

      {isSelected && (
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink">
            청구 대상 회원 <span className="text-coral">*</span>
          </span>
          {membersLoading ? (
            <p className="text-sm text-charcoal-3">회원을 불러오는 중…</p>
          ) : !members || members.length === 0 ? (
            <p className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-charcoal-2">
              활성 회원이 없습니다.
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-line p-2">
              {members.map((member) => (
                <label
                  key={member.userId}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-graysoft"
                >
                  <input
                    type="checkbox"
                    checked={selectedUserIds.includes(member.userId)}
                    onChange={() => toggleMember(member.userId)}
                    className="h-4 w-4 accent-ink"
                  />
                  <span className="text-ink">{member.name}</span>
                  <span className="text-xs text-charcoal-3">{member.studentId}</span>
                </label>
              ))}
            </div>
          )}
          {selectedUserIds.length > 0 && (
            <p className="mt-1 text-xs text-charcoal-3">{selectedUserIds.length}명 선택됨</p>
          )}
          {memberError && <p className="mt-1 text-xs text-coral">{memberError}</p>}
        </div>
      )}

      {policy.billingType === 'MONTHLY' && (
        <Field
          id="bill-period-month"
          label="청구 회차 (YYYY-MM)"
          required
          error={errors.billingPeriod?.message}
        >
          <input
            id="bill-period-month"
            type="text"
            placeholder="2026-07"
            {...register('billingPeriod')}
            className={cn(inputCls, errors.billingPeriod && errorInputCls)}
          />
        </Field>
      )}

      {policy.billingType === 'YEARLY' && (
        <>
          <Field
            id="bill-period-year"
            label="청구 연도 (YYYY)"
            required
            error={errors.billingPeriod?.message}
          >
            <input
              id="bill-period-year"
              type="text"
              placeholder="2026"
              {...register('billingPeriod')}
              className={cn(inputCls, errors.billingPeriod && errorInputCls)}
            />
          </Field>
          <Field id="bill-due-year" label="마감일 (선택)" error={errors.dueDate?.message}>
            <input
              id="bill-due-year"
              type="date"
              {...register('dueDate')}
              className={cn(inputCls, errors.dueDate && errorInputCls)}
            />
          </Field>
        </>
      )}

      {policy.billingType === 'SEMESTER' && (
        <>
          <Field
            id="bill-label-semester"
            label="회차 라벨"
            required
            error={errors.billingPeriod?.message}
          >
            <input
              id="bill-label-semester"
              type="text"
              placeholder="2026-1학기"
              {...register('billingPeriod')}
              className={cn(inputCls, errors.billingPeriod && errorInputCls)}
            />
          </Field>
          <Field
            id="bill-start-semester"
            label="시작일"
            required
            error={'billingStartDate' in errors ? errors.billingStartDate?.message : undefined}
          >
            <input
              id="bill-start-semester"
              type="date"
              {...register('billingStartDate')}
              className={cn(
                inputCls,
                'billingStartDate' in errors && errors.billingStartDate && errorInputCls,
              )}
            />
          </Field>
          <Field
            id="bill-end-semester"
            label="종료일"
            required
            error={'billingEndDate' in errors ? errors.billingEndDate?.message : undefined}
          >
            <input
              id="bill-end-semester"
              type="date"
              {...register('billingEndDate')}
              className={cn(
                inputCls,
                'billingEndDate' in errors && errors.billingEndDate && errorInputCls,
              )}
            />
          </Field>
          <Field id="bill-due-semester" label="마감일" required error={errors.dueDate?.message}>
            <input
              id="bill-due-semester"
              type="date"
              {...register('dueDate')}
              className={cn(inputCls, errors.dueDate && errorInputCls)}
            />
          </Field>
        </>
      )}

      {policy.billingType === 'ONE_TIME' && (
        <>
          <Field
            id="bill-label-onetime"
            label="회차 라벨"
            required
            error={errors.billingPeriod?.message}
          >
            <input
              id="bill-label-onetime"
              type="text"
              placeholder="MT참가비"
              {...register('billingPeriod')}
              className={cn(inputCls, errors.billingPeriod && errorInputCls)}
            />
          </Field>
          <Field
            id="bill-start-onetime"
            label="행사일"
            required
            error={'billingStartDate' in errors ? errors.billingStartDate?.message : undefined}
          >
            <input
              id="bill-start-onetime"
              type="date"
              {...register('billingStartDate')}
              className={cn(
                inputCls,
                'billingStartDate' in errors && errors.billingStartDate && errorInputCls,
              )}
            />
          </Field>
          <Field id="bill-due-onetime" label="마감일" required error={errors.dueDate?.message}>
            <input
              id="bill-due-onetime"
              type="date"
              {...register('dueDate')}
              className={cn(inputCls, errors.dueDate && errorInputCls)}
            />
          </Field>
        </>
      )}

      {submitErrorMessage && (
        <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">{submitErrorMessage}</p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting || generateBills.isPending}
          className="flex-1 rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting || generateBills.isPending}
          className={cn(
            'flex-1 rounded-md py-3 text-sm font-semibold text-paper transition-colors',
            'bg-ink hover:bg-ink-deep',
            (isSubmitting || generateBills.isPending) && 'cursor-not-allowed opacity-60',
          )}
        >
          {generateBills.isPending ? '발행 중…' : '발행'}
        </button>
      </div>
    </form>
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

// 폼 기본값을 정책 유형에 맞춘 discriminatedUnion 분기로 채운다(billingType 고정).
function defaultValuesFor(billingType: FeePolicy['billingType']): GenerateBillsInput {
  switch (billingType) {
    case 'MONTHLY':
      return { billingType: 'MONTHLY', billingPeriod: '', dueDate: '' };
    case 'YEARLY':
      return { billingType: 'YEARLY', billingPeriod: '', dueDate: '' };
    case 'SEMESTER':
      return {
        billingType: 'SEMESTER',
        billingPeriod: '',
        billingStartDate: '',
        billingEndDate: '',
        dueDate: '',
      };
    case 'ONE_TIME':
      return {
        billingType: 'ONE_TIME',
        billingPeriod: '',
        billingStartDate: '',
        dueDate: '',
      };
  }
}
