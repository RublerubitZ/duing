'use client';

import { useForm, useController } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useSubmitPromotionRequestMutation } from '@duing/hooks';
import { submitPromotionRequestSchema } from '@duing/schemas';
import type { SubmitPromotionRequestInput } from '@duing/schemas';

import { cn } from '@/app/_lib/cn';
import { ImageUploader } from '@/app/_components/ImageUploader';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ButtonSpinner } from '@/components/loading/Spinner';

type PromotionRequestModalProps = {
  clubId: number;
  clubName: string;
  onClose: () => void;
};

const inputCls =
  'w-full rounded-md border px-4 py-3 text-sm outline-none transition-colors border-line placeholder:text-charcoal-3 focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink';

export function PromotionRequestModal({ clubId, clubName, onClose }: PromotionRequestModalProps) {
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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submitPromotion.isPending) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3">
          <DialogHeader>
            <DialogTitle>홍보 요청</DialogTitle>
            <p className="text-xs text-charcoal-3">{clubName}</p>
          </DialogHeader>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting || submitPromotion.isPending}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal-3 transition-colors hover:bg-graysoft hover:text-ink disabled:opacity-50"
          >
            <CloseIcon />
          </button>
        </div>

        <DialogDescription className="text-sm text-charcoal-2">
          총동연에 홍보 배너 게재를 요청합니다. 요청 내용 검토 후 메인 화면에 노출됩니다.
        </DialogDescription>

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
              className={cn(inputCls, errors.title && 'border-coral focus-visible:border-coral focus-visible:ring-coral')}
            />
            <div className="mt-1 flex justify-between">
              {errors.title ? <p className="text-xs text-coral">{errors.title.message}</p> : <span />}
              <span className="text-xs text-charcoal-3">{titleValue.length} / 80</span>
            </div>
          </div>

          <div>
            <label htmlFor="promo-description" className="mb-1.5 block text-sm font-semibold text-ink">
              설명 <span className="text-coral">*</span>
              <span className="ml-1 text-xs font-normal text-charcoal-3">(최대 2000자)</span>
            </label>
            <textarea
              id="promo-description"
              rows={4}
              placeholder="동아리 소개 및 홍보 내용을 구체적으로 작성해주세요."
              {...register('description')}
              className={cn(
                inputCls,
                'resize-none',
                errors.description && 'border-coral focus-visible:border-coral focus-visible:ring-coral',
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
            <label htmlFor="promo-link-url" className="mb-1.5 block text-sm font-semibold text-ink">
              희망 링크 URL
              <span className="ml-1 text-xs font-normal text-charcoal-3">(선택)</span>
            </label>
            <input
              id="promo-link-url"
              type="url"
              placeholder="https://..."
              {...register('suggestedLinkUrl')}
              className={cn(inputCls, errors.suggestedLinkUrl && 'border-coral focus-visible:border-coral focus-visible:ring-coral')}
            />
            {errors.suggestedLinkUrl && (
              <p className="mt-1 text-xs text-coral">{errors.suggestedLinkUrl.message}</p>
            )}
          </div>

          {submitPromotion.isError && (
            <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">
              {submitPromotion.error instanceof Error
                ? submitPromotion.error.message
                : '요청 중 오류가 발생했습니다. 다시 시도해주세요.'}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting || submitPromotion.isPending}
              className="flex-1 rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || submitPromotion.isPending}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-3 text-sm font-semibold text-paper transition-colors',
                'bg-ink hover:bg-ink-deep',
                (isSubmitting || submitPromotion.isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {submitPromotion.isPending && <ButtonSpinner />}홍보 요청 제출
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
