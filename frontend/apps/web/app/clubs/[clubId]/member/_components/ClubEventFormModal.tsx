'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClubEventSchema } from '@duing/schemas';
import type { CreateClubEventInput } from '@duing/schemas';
import { useCreateClubEventMutation, useUpdateClubEventMutation } from '@duing/hooks';
import { cn } from '@/app/_lib/cn';

type CommonProps = { clubId: number; onClose: () => void };

type Props =
  | (CommonProps & { mode: 'create' })
  | (CommonProps & {
      mode: 'edit';
      eventId: number;
      defaultValues: Partial<CreateClubEventInput>;
    });

export function ClubEventFormModal(props: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const createMutation = useCreateClubEventMutation(props.clubId);
  const updateMutation = useUpdateClubEventMutation(props.clubId);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateClubEventInput>({
    resolver: zodResolver(createClubEventSchema),
    defaultValues: props.mode === 'edit' ? props.defaultValues : undefined,
  });

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

  const onSubmit = (formData: CreateClubEventInput) => {
    const title = formData.title.trim();
    const startAt = new Date(formData.startAt).toISOString();
    const endAt = new Date(formData.endAt).toISOString();

    if (props.mode === 'create') {
      createMutation.mutate(
        {
          title,
          description: formData.description?.trim() || undefined,
          startAt,
          endAt,
          location: formData.location?.trim() || undefined,
        },
        { onSuccess: () => props.onClose() },
      );
      return;
    }

    // 수정: 설명/장소는 빈 문자열을 그대로 보내 비우기를 반영한다(백엔드는 ''를 그대로 저장).
    updateMutation.mutate(
      {
        eventId: props.eventId,
        payload: {
          title,
          description: formData.description?.trim() ?? '',
          startAt,
          endAt,
          location: formData.location?.trim() ?? '',
        },
      },
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
      aria-label={props.mode === 'create' ? '일정 추가' : '일정 수정'}
    >
      <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-1 flex-col">
          <h2 className="shrink-0 px-6 pb-4 pt-6 text-base font-bold text-ink">
            {props.mode === 'create' ? '일정 추가' : '일정 수정'}
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
              {errors.title && <p className="mt-1 text-xs text-coral">{errors.title.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  시작 <span className="text-coral">*</span>
                </label>
                <input
                  type="datetime-local"
                  {...register('startAt')}
                  className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
                />
                {errors.startAt && <p className="mt-1 text-xs text-coral">{errors.startAt.message}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-ink">
                  종료 <span className="text-coral">*</span>
                </label>
                <input
                  type="datetime-local"
                  {...register('endAt')}
                  className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
                />
                {errors.endAt && <p className="mt-1 text-xs text-coral">{errors.endAt.message}</p>}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                장소 <span className="text-xs font-normal text-charcoal-3">(선택)</span>
              </label>
              <input
                type="text"
                {...register('location')}
                className="w-full rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
              />
            </div>

            <div className="pb-1">
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                설명 <span className="text-xs font-normal text-charcoal-3">(선택)</span>
              </label>
              <textarea
                rows={4}
                {...register('description')}
                className="w-full resize-none rounded-xl border border-line px-4 py-3 text-sm outline-none focus:border-ink focus:ring-1 focus:ring-ink"
              />
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
              {isPending ? '저장 중…' : props.mode === 'create' ? '추가' : '수정'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
