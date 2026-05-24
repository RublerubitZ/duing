'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSubmitReportMutation } from '@duing/hooks';
import type { ReportTargetType } from '@duing/types';
import { cn } from '@/app/_lib/cn';

type Props = {
  targetType: ReportTargetType;
  targetId: number;
  targetLabel: string;
  onClose: () => void;
};

const REASON_CODE_VALUES = ['SPAM', 'FRAUD', 'INAPPROPRIATE', 'IMPERSONATION', 'OTHER'] as const;
type ReasonCode = (typeof REASON_CODE_VALUES)[number];

const reportFormSchema = z.object({
  reasonCode: z.enum(REASON_CODE_VALUES, {
    errorMap: () => ({ message: '신고 사유를 선택해주세요.' }),
  }),
  detail: z.string().max(1000, '상세 내용은 1000자 이하여야 합니다.').optional(),
});

type ReportFormValues = z.infer<typeof reportFormSchema>;

const REASON_OPTIONS: { value: ReasonCode; label: string }[] = [
  { value: 'SPAM', label: '스팸 / 광고' },
  { value: 'FRAUD', label: '사기 / 허위 정보' },
  { value: 'INAPPROPRIATE', label: '부적절한 콘텐츠' },
  { value: 'IMPERSONATION', label: '사칭' },
  { value: 'OTHER', label: '기타' },
];

export function ReportModal({ targetType, targetId, targetLabel, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const submitReport = useSubmitReportMutation();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
  });

  const detailValue = watch('detail') ?? '';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const onSubmit = (formData: ReportFormValues) => {
    submitReport.mutate(
      {
        targetType,
        targetId,
        reasonCode: formData.reasonCode,
        detail: formData.detail?.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          alert('신고가 접수되었습니다. 검토 후 처리해 드리겠습니다.');
        },
      },
    );
  };

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="신고 제출"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {/* 헤더 */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">신고하기</h2>
            <p className="mt-0.5 text-xs text-charcoal-3 line-clamp-1">
              {targetLabel}
            </p>
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

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {/* 신고 사유 */}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">
              신고 사유 <span className="text-coral">*</span>
            </legend>
            <div className="space-y-2">
              {REASON_OPTIONS.map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors',
                    'border-line hover:border-ink-light hover:bg-graysoft',
                  )}
                >
                  <input
                    type="radio"
                    value={value}
                    {...register('reasonCode')}
                    className="accent-ink"
                  />
                  {label}
                </label>
              ))}
            </div>
            {errors.reasonCode && (
              <p className="mt-1.5 text-xs text-coral">{errors.reasonCode.message}</p>
            )}
          </fieldset>

          {/* 상세 내용 */}
          <div>
            <label
              htmlFor="report-detail"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              상세 내용{' '}
              <span className="text-xs font-normal text-charcoal-3">(선택, 최대 1000자)</span>
            </label>
            <textarea
              id="report-detail"
              rows={4}
              placeholder="신고 사유를 구체적으로 적어주세요."
              {...register('detail')}
              className={cn(
                'w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.detail && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.detail ? (
                <p className="text-xs text-coral">{errors.detail.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-charcoal-3">
                {detailValue.length} / 1000
              </span>
            </div>
          </div>

          {/* 제출 에러 */}
          {submitReport.isError && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-coral">
              신고 접수 중 오류가 발생했습니다. 다시 시도해주세요.
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
              disabled={isSubmitting || submitReport.isPending}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors',
                'bg-coral hover:bg-coral/90',
                (isSubmitting || submitReport.isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {submitReport.isPending ? '접수 중…' : '신고 접수'}
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
