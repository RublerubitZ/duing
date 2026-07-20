'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  formatDateTimeKst,
  useRecertificationContextQuery,
  useSubmitRecertificationRequestMutation,
} from '@duing/hooks';
import { submitRecertificationRequestSchema } from '@duing/schemas';
import type { SubmitRecertificationRequestInput } from '@duing/schemas';
import type { LeaderRecertificationContext } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingGate } from '@/components/loading/LoadingGate';
import { ButtonSpinner } from '@/components/loading/Spinner';

type Props = {
  clubId: number;
  clubName: string;
  onClose: () => void;
};

export function RecertificationRequestModal({ clubId, clubName, onClose }: Props) {
  const { data: context, isLoading, isError, refetch } = useRecertificationContextQuery(clubId);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-lg" aria-describedby={undefined}>
        <div className="flex items-start justify-between gap-3">
          <DialogHeader>
            <DialogTitle>재인증 신청</DialogTitle>
            <p className="text-xs text-charcoal-3">{clubName}</p>
          </DialogHeader>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-charcoal-3 transition-colors hover:bg-graysoft hover:text-ink"
          >
            <CloseIcon />
          </button>
        </div>

        {isLoading && <LoadingGate label="재인증 정보 불러오는 중" className="min-h-0 py-8" />}

        {isError && (
          <div className="space-y-3">
            <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">
              정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-md border border-line px-4 py-2 text-sm text-charcoal-2 transition-colors hover:bg-graysoft"
            >
              다시 시도
            </button>
          </div>
        )}

        {context && <ContextBody clubId={clubId} context={context} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ContextBody({
  clubId,
  context,
  onClose,
}: {
  clubId: number;
  context: LeaderRecertificationContext;
  onClose: () => void;
}) {
  if (!context.centralClub) {
    return <InfoNotice message="중앙동아리만 신청할 수 있습니다." onClose={onClose} />;
  }
  if (context.openRound === null) {
    return (
      <InfoNotice
        message="현재 진행 중인 재인증 라운드가 없습니다. 총동연이 라운드를 열면 다시 시도해주세요."
        onClose={onClose}
      />
    );
  }
  if (context.pendingRequest !== null) {
    return (
      <PendingNotice
        pending={context.pendingRequest}
        roundLabel={context.openRound.label}
        onClose={onClose}
      />
    );
  }
  return (
    <RecertificationForm
      clubId={clubId}
      openRoundYear={context.openRound.year}
      openRoundLabel={context.openRound.label}
      onClose={onClose}
    />
  );
}

function InfoNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-charcoal-2">{message}</p>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
      >
        닫기
      </button>
    </div>
  );
}

function PendingNotice({
  pending,
  roundLabel,
  onClose,
}: {
  pending: NonNullable<LeaderRecertificationContext['pendingRequest']>;
  roundLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-cream px-4 py-3 text-sm text-charcoal-2">
        <p className="font-semibold text-ink">이미 신청하신 건이 있습니다.</p>
        <dl className="mt-2 space-y-1 text-xs">
          <Row label="라운드">{roundLabel}</Row>
          <Row label="운영 연도">{pending.operatingYear}</Row>
          <Row label="대표 이메일">{pending.contactEmail}</Row>
          <Row label="대표 연락처">{pending.contactPhone}</Row>
          <Row label="제출 일시">{formatDateTimeKst(pending.createdAt)}</Row>
        </dl>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
      >
        닫기
      </button>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-charcoal-3">{label}</dt>
      <dd className="text-charcoal-2">{children}</dd>
    </div>
  );
}

function RecertificationForm({
  clubId,
  openRoundYear,
  openRoundLabel,
  onClose,
}: {
  clubId: number;
  openRoundYear: number;
  openRoundLabel: string;
  onClose: () => void;
}) {
  const submitRequest = useSubmitRecertificationRequestMutation(clubId);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SubmitRecertificationRequestInput>({
    resolver: zodResolver(submitRecertificationRequestSchema),
    defaultValues: {
      contactEmail: '',
      contactPhone: '',
      operatingYear: openRoundYear,
      notes: '',
    },
  });

  const notesValue = watch('notes') ?? '';

  const onSubmit = (formData: SubmitRecertificationRequestInput) => {
    submitRequest.mutate(
      {
        contactEmail: formData.contactEmail.trim(),
        contactPhone: formData.contactPhone.trim(),
        operatingYear: openRoundYear,
        notes: formData.notes?.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose();
          alert('재인증 신청이 접수되었습니다. 총동연 검토 후 처리됩니다.');
        },
      },
    );
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <div className="rounded-lg border border-line bg-sage-tint px-4 py-3 text-sm text-ink">
        <p className="font-semibold">{openRoundLabel}</p>
        <p className="mt-0.5 text-xs text-charcoal-2">운영 연도 {openRoundYear}</p>
      </div>

      <Field id="recert-email" label="대표 이메일" required error={errors.contactEmail?.message}>
        <input
          id="recert-email"
          type="email"
          placeholder="leader@daegu.ac.kr"
          {...register('contactEmail')}
          className={inputClass(!!errors.contactEmail)}
        />
      </Field>

      <Field id="recert-phone" label="대표 연락처" required error={errors.contactPhone?.message}>
        <input
          id="recert-phone"
          type="tel"
          placeholder="010-1234-5678"
          {...register('contactPhone')}
          className={inputClass(!!errors.contactPhone)}
        />
      </Field>

      <Field id="recert-notes" label="보충 메모" hint="(선택, 최대 2000자)" error={errors.notes?.message}>
        <textarea
          id="recert-notes"
          rows={4}
          placeholder="총동연이 참고할 추가 정보가 있다면 작성해주세요."
          {...register('notes')}
          className={cn(inputClass(!!errors.notes), 'resize-none')}
        />
        <div className="mt-1 flex justify-end">
          <span className="text-xs text-charcoal-3">{notesValue.length} / 2000</span>
        </div>
      </Field>

      {submitRequest.isError && (
        <p className="rounded-md bg-coral/5 px-4 py-3 text-sm text-coral">
          {submitRequest.error instanceof Error
            ? submitRequest.error.message
            : '신청 처리 중 오류가 발생했습니다.'}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-md border border-line py-3 text-sm font-semibold text-charcoal-2 transition-colors hover:bg-graysoft"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={isSubmitting || submitRequest.isPending}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md py-3 text-sm font-semibold text-paper transition-colors',
            'bg-ink hover:bg-ink-deep',
            (isSubmitting || submitRequest.isPending) && 'cursor-not-allowed opacity-60',
          )}
        >
          {submitRequest.isPending && <ButtonSpinner />}재인증 신청 제출
        </button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-coral">*</span>}
        {hint && <span className="ml-1 text-xs font-normal text-charcoal-3">{hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-coral">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return cn(
    'w-full rounded-md border px-4 py-3 text-sm outline-none transition-colors',
    'border-line placeholder:text-charcoal-3',
    'focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink',
    hasError && 'border-coral focus-visible:border-coral focus-visible:ring-coral',
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
