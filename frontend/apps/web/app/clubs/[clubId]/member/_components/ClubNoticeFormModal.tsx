'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClubNoticeSchema } from '@duing/schemas';
import type { CreateClubNoticeInput } from '@duing/schemas';
import type { UpdateClubNoticePayload } from '@duing/types';
import { useCreateClubNoticeMutation, useUpdateClubNoticeMutation } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';

type CommonProps = { clubId: number; onClose: () => void };

type Props =
  | (CommonProps & { mode: 'create' })
  | (CommonProps & {
      mode: 'edit';
      noticeId: number;
      defaultValues: Partial<CreateClubNoticeInput>;
    });

export function ClubNoticeFormModal(props: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const createMutation = useCreateClubNoticeMutation(props.clubId);
  const updateMutation = useUpdateClubNoticeMutation(props.clubId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateClubNoticeInput>({
    resolver: zodResolver(createClubNoticeSchema),
    defaultValues: props.mode === 'edit' ? props.defaultValues : undefined,
  });

  const titleValue = watch('title') ?? '';
  const contentValue = watch('content') ?? '';

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') props.onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [props]);

  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === overlayRef.current) props.onClose();
  };

  const onSubmit = (formData: CreateClubNoticeInput) => {
    const title = formData.title.trim();
    const content = formData.content.trim();
    const pinned = formData.pinned ?? false;
    const expiresAt = formData.expiresAt || undefined;

    if (props.mode === 'create') {
      createMutation.mutate(
        {
          title,
          content,
          summary: formData.summary?.trim() || undefined,
          coverImageUrl: formData.coverImageUrl?.trim() || undefined,
          pinned,
          expiresAt,
        },
        { onSuccess: () => props.onClose() },
      );
      return;
    }

    // 수정: 요약은 빈 문자열을 그대로 보내 비우기를 반영한다(summary 컬럼 NOT NULL).
    // 표지 이미지는 이 모달에 입력 UI 가 없어 편집 대상이 아니므로 payload 에서 제외해 기존 커버를 보존한다.
    const payload: UpdateClubNoticePayload = {
      title,
      content,
      summary: formData.summary?.trim() ?? '',
      pinned,
      expiresAt,
    };
    updateMutation.mutate(
      { noticeId: props.noticeId, payload },
      { onSuccess: () => props.onClose() },
    );
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={props.mode === 'create' ? '공지 작성' : '공지 수정'}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-base font-bold text-ink">
          {props.mode === 'create' ? '공지 작성' : '공지 수정'}
        </h2>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              제목 <span className="text-coral">*</span>
            </label>
            <input
              type="text"
              {...register('title')}
              className={cn(
                'w-full rounded-xl border px-4 py-3 text-sm outline-none',
                'border-line focus:border-ink focus:ring-1 focus:ring-ink',
                errors.title && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.title ? (
                <p className="text-xs text-coral">{errors.title.message}</p>
              ) : <span />}
              <span className="text-xs text-charcoal-3">{titleValue.length} / 120</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              요약 <span className="text-xs font-normal text-charcoal-3">(선택, 500자)</span>
            </label>
            <input
              type="text"
              {...register('summary')}
              className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-ink">
              본문 <span className="text-coral">*</span>
            </label>
            <textarea
              rows={8}
              {...register('content')}
              className={cn(
                'w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none',
                'border-line focus:border-ink focus:ring-1 focus:ring-ink',
                errors.content && 'border-coral focus:border-coral focus:ring-coral',
              )}
            />
            <div className="mt-1 flex justify-between">
              {errors.content ? (
                <p className="text-xs text-coral">{errors.content.message}</p>
              ) : <span />}
              <span className="text-xs text-charcoal-3">{contentValue.length} / 20000</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input id="pinned" type="checkbox" {...register('pinned')} />
            <label htmlFor="pinned" className="text-sm text-charcoal-2">상단 고정</label>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={props.onClose}
              className="flex-1 rounded-xl border border-line py-3 text-sm font-semibold text-charcoal-2 hover:bg-graysoft"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isPending}
              className={cn(
                'flex-1 rounded-xl py-3 text-sm font-semibold text-white',
                'bg-ink hover:bg-ink/90',
                (isSubmitting || isPending) && 'cursor-not-allowed opacity-60',
              )}
            >
              {isPending ? '저장 중…' : (props.mode === 'create' ? '작성' : '수정')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
