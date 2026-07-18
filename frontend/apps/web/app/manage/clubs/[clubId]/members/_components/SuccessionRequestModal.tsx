'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useSubmitSuccessionRequestMutation } from '@duing/hooks';
import { submitSuccessionRequestSchema } from '@duing/schemas';
import type { SubmitSuccessionRequestInput } from '@duing/schemas';

import { cn } from '@/app/_lib/cn';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type Props = {
  clubId: number;
  clubName: string;
  onClose: () => void;
};

export function SuccessionRequestModal({ clubId, clubName, onClose }: Props) {
  const submitSuccession = useSubmitSuccessionRequestMutation(clubId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitSuccessionRequestInput>({
    resolver: zodResolver(submitSuccessionRequestSchema),
  });

  const reasonValue = watch('reason') ?? '';

  const onSubmit = (formData: SubmitSuccessionRequestInput) => {
    submitSuccession.mutate(formData, {
      onSuccess: () => {
        onClose();
        alert('승계 요청이 접수되었습니다. 총동연 검토 후 처리됩니다.');
      },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitSuccession.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3">
          <DialogHeader>
            <DialogTitle>회장 승계 요청</DialogTitle>
            <p className="text-xs text-charcoal-3">{clubName}</p>
          </DialogHeader>
          <button
            type="button"
            onClick={onClose}
            disabled={submitSuccession.isPending}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal-3 transition-colors hover:bg-graysoft hover:text-ink disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <DialogDescription className="text-sm text-charcoal-2">
          현재 회장이 장기간 활동이 없을 경우, 운영진이 총동연에 회장 승계를 요청할 수 있습니다. 요청은 총동연 검토 후 처리됩니다.
        </DialogDescription>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* 사유 */}
          <div>
            <label htmlFor="succession-reason" className="mb-1.5 block text-sm font-semibold text-ink">
              요청 사유 <span className="text-coral">*</span>
              <span className="ml-1 text-xs font-normal text-charcoal-3">(최대 1000자)</span>
            </label>
            <textarea
              id="succession-reason"
              rows={5}
              placeholder="회장이 연락 두절된 기간, 동아리 운영에 미치는 영향 등을 구체적으로 적어주세요."
              {...register('reason')}
              className={cn(
                'w-full resize-none rounded-md border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink',
                errors.reason && 'border-coral focus-visible:border-coral focus-visible:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.reason ? (
                <p className="text-xs text-coral">{errors.reason.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-charcoal-3">{reasonValue.length} / 1000</span>
            </div>
          </div>

          {/* 제출 에러 */}
          {submitSuccession.isError && (
            <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">
              {submitSuccession.error instanceof Error
                ? submitSuccession.error.message
                : '요청 중 오류가 발생했습니다. 다시 시도해주세요.'}
            </p>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitSuccession.isPending}
              className="flex-1 rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || submitSuccession.isPending}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-3 text-sm font-semibold text-paper transition-colors',
                'bg-ink hover:bg-ink-deep',
                (isSubmitting || submitSuccession.isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {submitSuccession.isPending && <ButtonSpinner />}승계 요청
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
