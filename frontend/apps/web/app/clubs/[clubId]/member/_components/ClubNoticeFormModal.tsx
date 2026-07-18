'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClubNoticeSchema } from '@duing/schemas';
import type { CreateClubNoticeInput } from '@duing/schemas';
import type { NoticeContentFormat, UpdateClubNoticePayload } from '@duing/types';
import { useCreateClubNoticeMutation, useUpdateClubNoticeMutation } from '@duing/hooks';
import { ImageUploader } from '@/app/_components/ImageUploader';
import { NoticeRichEditorLazy } from '@/app/_components/NoticeRichEditorLazy';
import { cn } from '@/app/_lib/cn';

type CommonProps = { clubId: number; onClose: () => void };

type Props =
  | (CommonProps & { mode: 'create' })
  | (CommonProps & {
      mode: 'edit';
      noticeId: number;
      defaultValues: Partial<CreateClubNoticeInput>;
      defaultContentFormat: NoticeContentFormat;
    });

export function ClubNoticeFormModal(props: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const createMutation = useCreateClubNoticeMutation(props.clubId);
  const updateMutation = useUpdateClubNoticeMutation(props.clubId);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateClubNoticeInput>({
    resolver: zodResolver(createClubNoticeSchema),
    defaultValues: props.mode === 'edit' ? props.defaultValues : undefined,
  });

  const titleValue = watch('title') ?? '';
  const contentValue = watch('content') ?? '';
  const coverImageUrl = watch('coverImageUrl') ?? '';
  // 본문 에디터 초기 시드 포맷 — 수정 시 레거시 MARKDOWN 공지면 HTML 로 변환 후 편집, 작성은 항상 HTML.
  const seedFormat: NoticeContentFormat = props.mode === 'edit' ? props.defaultContentFormat : 'HTML';

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
    const payload: UpdateClubNoticePayload = {
      title,
      content,
      summary: formData.summary?.trim() ?? '',
      pinned,
      expiresAt,
    };
    // 표지 이미지는 시드된 원본 대비 변경됐을 때만 반영한다 — 비우면 clear 플래그, 새 URL 이면 그대로 전송.
    const cover = formData.coverImageUrl?.trim() ?? '';
    const originalCover = (props.defaultValues.coverImageUrl ?? '').trim();
    if (cover !== originalCover) {
      if (cover === '') {
        payload.clearCoverImage = true;
      } else {
        payload.coverImageUrl = cover;
      }
    }
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={props.mode === 'create' ? '공지 작성' : '공지 수정'}
    >
      <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <h2 className="shrink-0 px-6 pb-4 pt-6 text-base font-bold text-ink">
            {props.mode === 'create' ? '공지 작성' : '공지 수정'}
          </h2>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6">
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
              <NoticeRichEditorLazy
                value={contentValue}
                format={seedFormat}
                onChange={(html) => setValue('content', html, { shouldDirty: true, shouldValidate: true })}
              />
              {errors.content && <p className="mt-1 text-xs text-coral">{errors.content.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                표지 이미지 <span className="text-xs font-normal text-charcoal-3">(선택)</span>
              </label>
              <ImageUploader
                value={coverImageUrl}
                onChange={(url) => setValue('coverImageUrl', url, { shouldDirty: true })}
                purpose="NOTICE_COVER"
                aspectRatio="16/9"
                placeholder="표지 이미지를 업로드하세요"
                altText="공지 표지"
              />
            </div>

            <div className="flex items-center gap-2 pb-1">
              <input id="pinned" type="checkbox" {...register('pinned')} />
              <label htmlFor="pinned" className="text-sm text-charcoal-2">상단 고정</label>
            </div>
          </div>

          <div className="flex shrink-0 gap-2 border-t border-line px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
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
