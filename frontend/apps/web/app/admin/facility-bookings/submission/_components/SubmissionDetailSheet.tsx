'use client';

import { useRef } from 'react';
import { formatDateKst } from '@duing/hooks';
import type { SubmissionCandidateBooking } from '@duing/types';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SUBMISSION_STATUS_LABELS, submissionBlockVisual } from '../_lib/submissionTimetable';

type Props = {
  booking: SubmissionCandidateBooking | null;
  facilityName: string;
  onClose: () => void;
};

/** 비-selectable 블록·목록 행의 상세 열람용 우측 Drawer(스펙 v2 §7.1). */
export function SubmissionDetailSheet({ booking, facilityName, onClose }: Props) {
  // 닫힘 애니메이션(약 300ms) 동안 내용이 사라지지 않게 마지막 booking 스냅샷을 유지한다 — 열림 여부는 booking prop 이 결정(WeekBlockSheet 전례).
  const lastBookingRef = useRef<SubmissionCandidateBooking | null>(null);
  if (booking !== null) lastBookingRef.current = booking;
  const shown = booking ?? lastBookingRef.current;

  return (
    <Sheet open={booking !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right">
        {shown !== null && (
          <>
            <SheetHeader>
              <SheetTitle>
                {/* 취소된 예약은 제목에 취소선 + '취소됨' 배지로 표시(PR-2 이월). */}
                <span className={shown.status === 'CANCELLED' ? 'line-through' : undefined}>
                  {shown.clubName ?? '동아리'} 예약 상세
                </span>
                {shown.status === 'CANCELLED' && (
                  <span className="ml-2 rounded-full bg-coral/10 px-2 py-0.5 align-middle text-[11px] font-medium text-coral">
                    취소됨
                  </span>
                )}
              </SheetTitle>
              <SheetDescription>
                {facilityName} · {shown.reservationDate} {shown.startTime}~{shown.endTime}
              </SheetDescription>
            </SheetHeader>
            <dl className="mt-4 space-y-2 text-sm text-charcoal">
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">상태</dt>
                <dd className={submissionBlockVisual(shown).nameClass}>
                  {SUBMISSION_STATUS_LABELS[shown.status]}
                  {shown.submitted && shown.submissionNo !== null ? ` · ${shown.submissionNo}` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">신청자</dt>
                <dd>{shown.applicantName ?? '-'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">연락처</dt>
                <dd>{shown.contactPhone ?? '-'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">사용목적</dt>
                <dd className="text-right">{shown.purpose}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">사용인원</dt>
                <dd>{shown.attendeeCount !== null ? `${shown.attendeeCount}명` : '-'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">승인자</dt>
                <dd>{shown.decidedByName ?? '-'}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-charcoal-3">승인일</dt>
                <dd>{shown.decidedAt !== null ? formatDateKst(shown.decidedAt) : '-'}</dd>
              </div>
            </dl>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
