'use client';

import { useState } from 'react';
import { ApiError } from '@duing/api';
import { useCancelFacilityBookingMutation, useFacilityBookingDetailQuery } from '@duing/hooks';
import type { BookingStatus } from '@duing/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/app/_components/toast/ToastProvider';
import {
  BOOKING_STATUS_META,
  bookingDateLabel,
  bookingDateTimeLabel,
  bookingTimeLabel,
} from '@/app/_lib/bookingDisplay';
import { BookingStatusBadge } from '@/app/_components/BookingStatusBadge';
import { CancelBookingDialog } from './CancelBookingDialog';

const STEPS = ['신청 완료', '총동연 승인', '학교 확정'] as const;

// 정상 경로 진행 단계 — 터미널 이탈 상태(REJECTED/CANCELLED/CONFLICT)는 스텝퍼 대신 안내 박스.
function stepIndexOf(status: BookingStatus): number | null {
  if (status === 'PENDING') return 0;
  if (status === 'APPROVED') return 1;
  if (status === 'CONFIRMED') return 2;
  return null;
}

type Props = {
  clubId: number;
  bookingId: number;
  onClose: () => void;
};

export function BookingDetailModal({ clubId, bookingId, onClose }: Props) {
  const detailQuery = useFacilityBookingDetailQuery(clubId, bookingId);
  const cancelMutation = useCancelFacilityBookingMutation();
  const { addToast } = useToast();
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelErrorMessage, setCancelErrorMessage] = useState<string | null>(null);

  const detail = detailQuery.data;
  const stepIndex = detail ? stepIndexOf(detail.status) : null;

  const confirmCancel = () => {
    setCancelErrorMessage(null);
    cancelMutation.mutate(
      { clubId, bookingId },
      {
        onSuccess: () => {
          addToast('예약 신청을 취소했어요.');
          setCancelConfirmOpen(false);
          onClose();
        },
        onError: (error) => {
          setCancelErrorMessage(
            error instanceof ApiError ? error.message : '취소에 실패했어요. 잠시 후 다시 시도해주세요.',
          );
        },
      },
    );
  };

  return (
    <>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent className="w-[calc(100%-2rem)]" aria-describedby={undefined}>
          <DialogTitle>예약 신청 상세</DialogTitle>

          {detailQuery.isLoading && <p className="text-sm text-charcoal-3">불러오는 중…</p>}
          {detailQuery.isError && (
            <p role="alert" className="text-sm text-charcoal-2">상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
          )}

          {detail && (
            <div className="space-y-4">
              {stepIndex !== null ? (
                <ol className="grid grid-cols-3 gap-1" aria-label="예약 진행 단계">
                  {STEPS.map((label, index) => (
                    <li key={label} className="flex flex-col items-center gap-1 text-center">
                      <span
                        aria-hidden
                        className={`h-2.5 w-2.5 rounded-full ${index <= stepIndex ? 'bg-ink' : 'bg-graysoft'}`}
                      />
                      <span className={`text-[11px] ${index <= stepIndex ? 'font-medium text-ink-deep' : 'text-charcoal-3'}`}>
                        {label}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className={`rounded-md px-3 py-2 text-sm ${BOOKING_STATUS_META[detail.status].badgeClass}`}>
                  {BOOKING_STATUS_META[detail.status].label}
                  {detail.status === 'REJECTED' && detail.rejectReason && ` — ${detail.rejectReason}`}
                  {detail.status === 'CONFLICT' && ` — ${detail.conflictDetail ?? '총동연이 확인 중이에요.'}`}
                </div>
              )}

              <div className="rounded-md border border-line bg-cream/60 px-3 py-3 text-sm">
                <p className="font-medium text-ink-deep">
                  {detail.roomName} · {bookingDateLabel(detail.date)} {bookingTimeLabel(detail.startTime, detail.endTime)}
                </p>
                <p className="mt-1 text-charcoal-2">{detail.purpose}</p>
                {detail.attendeeCount !== undefined && (
                  <p className="mt-1 text-xs text-charcoal-3">사용 인원 {detail.attendeeCount}명</p>
                )}
                <p className="mt-1 text-xs text-charcoal-3">
                  상태 <BookingStatusBadge status={detail.status} />
                </p>
              </div>

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

              <div className="flex gap-2 pt-1">
                {detail.status === 'PENDING' && (
                  <button
                    type="button"
                    className="btn rounded-[10px] bg-coral text-white disabled:opacity-50"
                    onClick={() => { setCancelErrorMessage(null); setCancelConfirmOpen(true); }}
                  >
                    신청 취소
                  </button>
                )}
                {detail.status === 'APPROVED' && (
                  <p className="self-center text-xs text-charcoal-3">승인된 신청의 취소는 총동연에 문의해주세요.</p>
                )}
                <button type="button" className="btn btn-ghost ml-auto" onClick={onClose}>닫기</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {detail && (
        <CancelBookingDialog
          open={cancelConfirmOpen}
          isPending={cancelMutation.isPending}
          errorMessage={cancelErrorMessage}
          summaryLabel={`${detail.roomName} · ${bookingDateLabel(detail.date)} ${bookingTimeLabel(detail.startTime, detail.endTime)}`}
          onConfirm={confirmCancel}
          onClose={() => {
            if (!cancelMutation.isPending) setCancelConfirmOpen(false);
          }}
        />
      )}
    </>
  );
}
