'use client';

import type { SubmissionCandidateBooking } from '@duing/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { submissionBlockVisual } from '../_lib/submissionTimetable';

const STATUS_LABELS: Record<SubmissionCandidateBooking['status'], string> = {
  PENDING: '승인 대기',
  APPROVED: '승인 완료',
  CONFIRMED: '학교 등록 완료',
  CONFLICT: '충돌',
  CANCELLED: '취소됨',
};

type Props = {
  booking: SubmissionCandidateBooking | null;
  facilityName: string;
  onClose: () => void;
};

/** 비-selectable 블록·목록 행의 상세 열람용 우측 Drawer(스펙 v2 §7.1). */
export function SubmissionDetailSheet({ booking, facilityName, onClose }: Props) {
  return (
    <Sheet open={booking !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right">
        {booking !== null && (
          <>
            <SheetHeader>
              <SheetTitle>{booking.clubName ?? '동아리'} 예약 상세</SheetTitle>
              <SheetDescription>
                {facilityName} · {booking.reservationDate} {booking.startTime}~{booking.endTime}
              </SheetDescription>
            </SheetHeader>
            <dl className="mt-4 space-y-2 text-sm text-charcoal">
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">상태</dt>
                <dd className={submissionBlockVisual(booking).nameClass}>
                  {STATUS_LABELS[booking.status]}
                  {booking.submitted && booking.submissionNo !== null ? ` · ${booking.submissionNo}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">신청자</dt><dd>{booking.applicantName ?? '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">연락처</dt><dd>{booking.contactPhone ?? '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">사용목적</dt><dd className="text-right">{booking.purpose}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">사용인원</dt><dd>{booking.attendeeCount !== null ? `${booking.attendeeCount}명` : '-'}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-charcoal-3">승인자</dt><dd>{booking.decidedByName ?? '-'}</dd></div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">승인일</dt>
                <dd>{booking.decidedAt !== null ? booking.decidedAt.slice(0, 10) : '-'}</dd>
              </div>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
