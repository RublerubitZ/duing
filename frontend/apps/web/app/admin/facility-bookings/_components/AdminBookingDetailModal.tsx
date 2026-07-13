'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import {
  useAdminFacilityBookingDetailQuery,
  useApproveFacilityBookingMutation,
  useCancelFacilityBookingAdminMutation,
  useConfirmFacilityBookingMutation,
  useMarkConflictFacilityBookingMutation,
  useRejectFacilityBookingMutation,
} from '@duing/hooks';
import type { FacilityBookingConflictPayload } from '@duing/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';
import {
  bookingDateLabel,
  bookingDateTimeLabel,
  bookingTimeLabel,
  BOOKING_STATUS_META,
} from '@/app/_lib/bookingDisplay';
import { crawlFreshnessLabel, isFacilityBookingConflictPayload } from '../_lib/adminBookingDisplay';
import { AdminSlotStrip } from './AdminSlotStrip';
import { BookingActionDialog } from './BookingActionDialog';

type ActionKind = 'approve' | 'reject' | 'confirm' | 'markConflict' | 'cancel';

const ACTION_META: Record<
  ActionKind,
  { title: string; description: string; reasonLabel: string | null; destructive: boolean; successMessage: string }
> = {
  approve: {
    title: '승인',
    description: '신청 시간대를 재검증한 뒤 승인합니다. 겹침이 있으면 승인되지 않아요.',
    reasonLabel: null,
    destructive: false,
    successMessage: '승인했어요. 학교 반영 후 자동 확정됩니다.',
  },
  reject: {
    title: '거절',
    description: '거절 사유는 신청 동아리에 그대로 표시됩니다.',
    reasonLabel: '거절 사유',
    destructive: true,
    successMessage: '거절했어요.',
  },
  confirm: {
    title: '수동 확정',
    description: '학교 반영을 직접 확인한 경우에만 확정하세요. 확정 후에는 되돌릴 수 없어요.',
    reasonLabel: null,
    destructive: false,
    successMessage: '확정했어요.',
  },
  markConflict: {
    title: '충돌 전환',
    description: '학교 일정과 충돌한 건으로 표시합니다. 상세는 동아리에 노출됩니다.',
    reasonLabel: '충돌 상세',
    destructive: true,
    successMessage: '충돌 상태로 전환했어요.',
  },
  cancel: {
    title: '취소',
    description: '승인된 예약을 취소합니다. 사유는 동아리에 표시됩니다.',
    reasonLabel: '취소 사유',
    destructive: true,
    successMessage: '취소했어요.',
  },
};

type Props = { bookingId: number; onClose: () => void };

export function AdminBookingDetailModal({ bookingId, onClose }: Props) {
  const detailQuery = useAdminFacilityBookingDetailQuery(bookingId);
  const approveMutation = useApproveFacilityBookingMutation();
  const rejectMutation = useRejectFacilityBookingMutation();
  const confirmMutation = useConfirmFacilityBookingMutation();
  const markConflictMutation = useMarkConflictFacilityBookingMutation();
  const cancelMutation = useCancelFacilityBookingAdminMutation();
  const { addToast } = useToast();

  const [activeAction, setActiveAction] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [conflictPayload, setConflictPayload] = useState<FacilityBookingConflictPayload | null>(null);

  const detail = detailQuery.data;

  const mutationOf = (kind: ActionKind) =>
    kind === 'approve'
      ? approveMutation
      : kind === 'reject'
        ? rejectMutation
        : kind === 'confirm'
          ? confirmMutation
          : kind === 'markConflict'
            ? markConflictMutation
            : cancelMutation;

  const isActionPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    confirmMutation.isPending ||
    markConflictMutation.isPending ||
    cancelMutation.isPending;

  const runAction = (kind: ActionKind, reason: string) => {
    setActionError(null);
    setConflictPayload(null);
    const callbacks = {
      onSuccess: () => {
        addToast(ACTION_META[kind].successMessage);
        setActiveAction(null);
      },
      onError: (error: unknown) => {
        if (
          error instanceof ApiError &&
          error.code === 'FACILITY_BOOKING_SCHOOL_CONFLICT' &&
          isFacilityBookingConflictPayload(error.payload)
        ) {
          setConflictPayload(error.payload);
          setActiveAction(null); // 확인 다이얼로그는 닫고 모달 본문의 충돌 패널로 안내
          return;
        }
        setActionError(error instanceof ApiError ? error.message : '처리에 실패했어요. 잠시 후 다시 시도해주세요.');
      },
    };
    if (kind === 'approve') approveMutation.mutate({ bookingId }, callbacks);
    else if (kind === 'confirm') confirmMutation.mutate({ bookingId }, callbacks);
    else if (kind === 'reject') rejectMutation.mutate({ bookingId, reason }, callbacks);
    else if (kind === 'markConflict') markConflictMutation.mutate({ bookingId, detail: reason }, callbacks);
    else cancelMutation.mutate({ bookingId, reason }, callbacks);
  };

  // §4.3 상태별 액션 매트릭스
  const availableActions: ActionKind[] =
    detail?.status === 'PENDING'
      ? ['approve', 'reject']
      : detail?.status === 'APPROVED'
        ? ['confirm', 'markConflict', 'cancel']
        : detail?.status === 'CONFLICT'
          ? ['approve', 'cancel']
          : [];

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (!next && !isActionPending) onClose();
        }}
      >
        <DialogContent className="w-[calc(100%-2rem)] max-w-lg" aria-describedby={undefined}>
          <DialogTitle>예약 신청 검토</DialogTitle>

          {detailQuery.isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
          {detailQuery.isError && (
            <p role="alert" className="text-sm text-charcoal-2">
              상세를 불러오지 못했어요. 잠시 후 다시 시도해주세요.
            </p>
          )}

          {detail && (
            <div className="space-y-4">
              <div className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
                <p className="flex items-center justify-between gap-2 font-medium text-ink-deep">
                  <span>
                    {detail.clubName} · {detail.roomName}
                  </span>
                  <BookingStatusBadge status={detail.status} />
                </p>
                <p className="mt-1 font-mono text-[13px] text-charcoal-2">
                  {bookingDateLabel(detail.date)} {bookingTimeLabel(detail.startTime, detail.endTime)}
                </p>
                <p className="mt-1 text-charcoal-2">{detail.purpose}</p>
                {detail.attendeeCount !== undefined && (
                  <p className="mt-1 text-xs text-charcoal-3">사용 인원 {detail.attendeeCount}명</p>
                )}
                {detail.rejectReason && <p className="mt-1 text-xs text-charcoal-3">거절 사유 — {detail.rejectReason}</p>}
                {detail.conflictDetail && <p className="mt-1 text-xs text-coral">충돌 상세 — {detail.conflictDetail}</p>}
              </div>

              {/* 크롤 신선도(§5.2) */}
              <div
                role={detail.stale ? 'alert' : undefined}
                className={`rounded-md px-3 py-2 text-xs ${detail.stale ? 'bg-coral/10 text-coral' : 'bg-graysoft/60 text-charcoal-3'}`}
              >
                {crawlFreshnessLabel(detail.crawlBasisAt, new Date())}
                {detail.stale && ' — 최신 크롤링을 확인하지 못했습니다. 마지막 수집 데이터를 기준으로 판단하세요.'}
              </div>

              <AdminSlotStrip startTime={detail.startTime} endTime={detail.endTime} overlaps={detail.overlaps} />
              {detail.overlappingPendingCount > 0 && (
                <p className="text-xs text-charcoal-3">
                  같은 시간대 대기 신청 {detail.overlappingPendingCount}건 — 승인 시 자동 거절됩니다.
                </p>
              )}

              {/* 승인 409 충돌 패널(§8.3) */}
              {conflictPayload && (
                <div role="alert" className="rounded-md border border-coral/40 bg-coral/10 px-3 py-2 text-xs text-coral">
                  <p className="font-bold">학교 예약과 시간이 충돌하여 승인할 수 없습니다.</p>
                  <ul className="mt-1 space-y-0.5">
                    {conflictPayload.conflicts.map((conflict, index) => (
                      <li key={`${conflict.start}-${index}`}>
                        {conflict.organization} · {conflict.start}~{conflict.end}
                      </li>
                    ))}
                  </ul>
                  {conflictPayload.crawlBasisAt && (
                    <p className="mt-1">기준 수집 시각 {conflictPayload.crawlBasisAt.slice(0, 16).replace('T', ' ')}</p>
                  )}
                  <p className="mt-1">충돌 전환 또는 거절로 처리하세요.</p>
                </div>
              )}

              {actionError && (
                <p role="alert" className="rounded-md bg-coral/5 px-3 py-2 text-xs text-coral">
                  {actionError}
                </p>
              )}

              {detail.history.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-charcoal-3">이력</p>
                  <ul className="space-y-1 text-xs text-charcoal-2">
                    {detail.history.map((item, index) => (
                      <li key={`${item.changedAt}-${index}`} className="flex items-baseline justify-between gap-2">
                        <span>
                          {BOOKING_STATUS_META[item.newStatus].label}
                          {item.reason && <span className="text-charcoal-3"> — {item.reason}</span>}
                        </span>
                        <span className="shrink-0 text-charcoal-3">{bookingDateTimeLabel(item.changedAt)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-1">
                {availableActions.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={`btn btn-sm ${ACTION_META[kind].destructive ? 'rounded-[10px] bg-coral text-white' : 'btn-primary'}`}
                    disabled={isActionPending}
                    onClick={() => {
                      setActionError(null);
                      setActiveAction(kind);
                    }}
                  >
                    {kind === 'approve' && detail.status === 'CONFLICT' ? '재승인' : ACTION_META[kind].title}
                  </button>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
                  닫기
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {activeAction !== null && (
        <BookingActionDialog
          open
          title={ACTION_META[activeAction].title}
          description={ACTION_META[activeAction].description}
          reasonLabel={ACTION_META[activeAction].reasonLabel}
          isPending={mutationOf(activeAction).isPending}
          errorMessage={actionError}
          destructive={ACTION_META[activeAction].destructive}
          onConfirm={(reason) => runAction(activeAction, reason)}
          onClose={() => {
            if (!mutationOf(activeAction).isPending) setActiveAction(null);
          }}
        />
      )}
    </>
  );
}
