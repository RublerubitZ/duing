'use client';

import { useEffect, useRef } from 'react';
import { useForm, useController } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSubmitPromotionRequestMutation } from '@duing/hooks';
import { submitPromotionRequestSchema } from '@duing/schemas';
import type { SubmitPromotionRequestInput } from '@duing/schemas';
import { cn } from '@/app/_lib/cn';
import { ImageUploader } from '@/app/_components/ImageUploader';

type PromotionRequestModalProps = {
  clubId: number;
  clubName: string;
  onClose: () => void;
};

export function PromotionRequestModal({ clubId, clubName, onClose }: PromotionRequestModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const submitPromotion = useSubmitPromotionRequestMutation(clubId);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SubmitPromotionRequestInput>({
    resolver: zodResolver(submitPromotionRequestSchema),
  });

  const { field: bannerField } = useController({
    control,
    name: 'suggestedBannerImageUrl',
    defaultValue: '',
  });

  const titleValue = watch('title') ?? '';
  const descriptionValue = watch('description') ?? '';

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

  const onSubmit = (formData: SubmitPromotionRequestInput) => {
    submitPromotion.mutate(
      {
        title: formData.title.trim(),
        description: formData.description.trim(),
        suggestedBannerImageUrl: formData.suggestedBannerImageUrl?.trim() || undefined,
        suggestedLinkUrl: formData.suggestedLinkUrl?.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          alert('홍보 요청이 접수되었습니다. 총동연 검토 후 처리됩니다.');
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
      aria-label="홍보 요청"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-ink">홍보 요청</h2>
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
          총동연에 홍보 배너 게재를 요청합니다. 요청 내용 검토 후 메인 화면에 노출됩니다.
        </p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="promo-title" className="mb-1.5 block text-sm font-semibold text-ink">
              제목 <span className="text-coral">*</span>
              <span className="ml-1 text-xs font-normal text-charcoal-3">(최대 80자)</span>
            </label>
            <input
              id="promo-title"
              type="text"
              placeholder="홍보 배너에 표시될 제목"
              {...register('title')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.title && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.title ? (
                <p className="text-xs text-coral">{errors.title.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-charcoal-3">{titleValue.length} / 80</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="promo-description"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              설명 <span className="text-coral">*</span>
              <span className="ml-1 text-xs font-normal text-charcoal-3">(최대 2000자)</span>
            </label>
            <textarea
              id="promo-description"
              rows={4}
              placeholder="동아리 소개 및 홍보 내용을 구체적으로 작성해주세요."
              {...register('description')}
              className={cn(
                'w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.description && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.description ? (
                <p className="text-xs text-coral">{errors.description.message}</p>
              ) : (
                <span />
              )}
              <span className="text-xs text-charcoal-3">{descriptionValue.length} / 2000</span>
            </div>
          </div>

          <div>
            <p className="mb-1.5 block text-sm font-semibold text-ink">
              희망 배너 이미지
              <span className="ml-1 text-xs font-normal text-charcoal-3">(선택)</span>
            </p>
            <ImageUploader
              value={bannerField.value ?? ''}
              onChange={bannerField.onChange}
              purpose="PROMOTION_REQUEST_BANNER"
              aspectRatio="16/9"
              placeholder="희망 배너 이미지를 업로드하세요 (선택)"
              altText="희망 배너"
            />
            {errors.suggestedBannerImageUrl && (
              <p className="mt-1 text-xs text-coral">{errors.suggestedBannerImageUrl.message}</p>
            )}
          </div>

          <div>
            <label
              htmlFor="promo-link-url"
              className="mb-1.5 block text-sm font-semibold text-ink"
            >
              희망 링크 URL
              <span className="ml-1 text-xs font-normal text-charcoal-3">(선택)</span>
            </label>
            <input
              id="promo-link-url"
              type="url"
              placeholder="https://..."
              {...register('suggestedLinkUrl')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors',
                'border-line placeholder:text-charcoal-3',
                'focus:border-ink focus:ring-1 focus:ring-ink',
                errors.suggestedLinkUrl && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            {errors.suggestedLinkUrl && (
              <p className="mt-1 text-xs text-coral">{errors.suggestedLinkUrl.message}</p>
            )}
          </div>

          {submitPromotion.isError && (
            <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-coral">
              {submitPromotion.error instanceof Error
                ? submitPromotion.error.message
                : '요청 중 오류가 발생했습니다. 다시 시도해주세요.'}
            </p>
          )}

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
              disabled={isSubmitting || submitPromotion.isPending}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold text-white transition-colors',
                'bg-ink hover:bg-ink/90',
                (isSubmitting || submitPromotion.isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {submitPromotion.isPending ? '요청 중…' : '홍보 요청 제출'}
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
