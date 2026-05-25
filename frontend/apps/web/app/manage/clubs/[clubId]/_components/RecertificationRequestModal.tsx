'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSubmitRecertificationRequestMutation } from '@duing/hooks';
import { submitRecertificationRequestSchema } from '@duing/schemas';
import type { SubmitRecertificationRequestInput } from '@duing/schemas';
import { cn } from '@/app/_lib/cn';

type Props = {
  clubId: number;
  clubName: string;
  onClose: () => void;
};

const CURRENT_YEAR = new Date().getFullYear();

export function RecertificationRequestModal({ clubId, clubName, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const submitRecertification = useSubmitRecertificationRequestMutation(clubId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitRecertificationRequestInput>({
    resolver: zodResolver(submitRecertificationRequestSchema),
    defaultValues: {
      operatingYear: CURRENT_YEAR,
    },
  });

  const notesValue = watch('notes') ?? '';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onClose();
  };

  const onSubmit = (formData: SubmitRecertificationRequestInput) => {
    submitRecertification.mutate(
      {
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        operatingYear: formData.operatingYear,
        notes: formData.notes?.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          alert('재인증 제출이 완료되었습니다. 총동연 검토 후 처리됩니다.');
        },
      },
    );
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="재인증 제출"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        {/* 헤더 */}
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">재인증 제출</h2>
            <p className="mt-0.5 text-xs text-charcoal-3">{clubName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal-3 hover:bg-graysoft hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        <p className="mb-5 text-sm text-charcoal-2">
          중앙동아리 재인증 의사를 총동연에 제출합니다. OPEN 상태인 라운드에만 제출할 수 있습니다.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* 연락 이메일 */}
          <div>
            <label
              htmlFor="recert-email"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              연락 이메일 <span className="text-coral">*</span>
            </label>
            <input
              id="recert-email"
              type="email"
              placeholder="example@daegu.ac.kr"
              {...register('contactEmail')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.contactEmail && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            {errors.contactEmail && (
              <p className="mt-1 text-xs text-coral">{errors.contactEmail.message}</p>
            )}
          </div>

          {/* 연락처 */}
          <div>
            <label
              htmlFor="recert-phone"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              연락처 <span className="text-coral">*</span>
            </label>
            <input
              id="recert-phone"
              type="text"
              placeholder="010-0000-0000"
              {...register('contactPhone')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.contactPhone && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            {errors.contactPhone && (
              <p className="mt-1 text-xs text-coral">{errors.contactPhone.message}</p>
            )}
          </div>

          {/* 운영 연도 */}
          <div>
            <label
              htmlFor="recert-year"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              운영 연도 <span className="text-coral">*</span>
            </label>
            <input
              id="recert-year"
              type="number"
              min={2000}
              max={2100}
              {...register('operatingYear', { valueAsNumber: true })}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.operatingYear && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            {errors.operatingYear && (
              <p className="mt-1 text-xs text-coral">{errors.operatingYear.message}</p>
            )}
          </div>

          {/* 메모 (선택) */}
          <div>
            <label
              htmlFor="recert-notes"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              메모
              <span className="ml-1 text-xs font-normal text-charcoal-3">(선택, 최대 2000자)</span>
            </label>
            <textarea
              id="recert-notes"
              rows={3}
              placeholder="전달 사항이 있으면 입력해주세요."
              {...register('notes')}
              className={cn(
                'w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.notes && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.notes ? (
                <p className="text-xs text-coral">{errors.notes.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-charcoal-3">{notesValue.length} / 2000</span>
            </div>
          </div>

          {/* 제출 에러 */}
          {submitRecertification.isError && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-coral">
              {submitRecertification.error instanceof Error
                ? submitRecertification.error.message
                : '요청 중 오류가 발생했습니다. 다시 시도해주세요.'}
            </p>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-charcoal-2 hover:bg-graysoft"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || submitRecertification.isPending}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors',
                'bg-ink hover:bg-ink/90',
                (isSubmitting || submitRecertification.isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {submitRecertification.isPending ? '제출 중…' : '재인증 제출'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
