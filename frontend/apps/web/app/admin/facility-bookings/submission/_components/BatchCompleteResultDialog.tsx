'use client';

import type {
  CompleteSubmissionBatchResult,
  SkippedSubmissionBooking,
  SubmissionCandidateBooking,
} from '@duing/types';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type Props = {
  result: CompleteSubmissionBatchResult | null;
  // 상세 화면(Task 5)만 공급 — 제외 행에 예약일·동아리를 붙인다. 목록 탭은 null → 예약번호로 표기.
  bookingsById: ReadonlyMap<number, SubmissionCandidateBooking> | null;
  onClose: () => void;
};

/**
 * 제외 행 라벨 — bookingsById 있으면 예약일·동아리, 없으면 예약번호. reason 은 BE 응답 원문 그대로 출력한다
 * (FE 재매핑 금지 — 스펙 계약). map 에 없는 bookingId 는 예약번호 표기로 폴백.
 */
function skippedRowLabel(
  skipped: SkippedSubmissionBooking,
  bookingsById: ReadonlyMap<number, SubmissionCandidateBooking> | null,
): string {
  const booking = bookingsById?.get(skipped.bookingId) ?? null;
  if (booking === null) return `예약 #${skipped.bookingId} · ${skipped.reason}`;
  const clubLabel = booking.clubName ?? `동아리 ${booking.clubId}`;
  return `${booking.reservationDate} ${clubLabel} · ${skipped.reason}`;
}

/**
 * 학교 제출 완료 결과(스펙 v3 §7.3) — 일부 예약이 제외됐을 때만 열려, 등록/제외 건수와 제외 사유(BE 원문)를
 * 보여준다. 스킵 0 건은 호출처가 토스트로 끝내 이 Dialog 를 열지 않는다.
 */
export function BatchCompleteResultDialog({ result, bookingsById, onClose }: Props) {
  return (
    <Dialog open={result !== null} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md" aria-describedby={undefined}>
        <DialogTitle>학교 제출 완료</DialogTitle>
        {result !== null && (
          <>
            <p className="text-sm text-charcoal-2">
              {`학교 제출이 완료되었습니다. 총 ${result.totalCount}건 중 ${result.confirmedCount}건이 학교 등록 완료되었습니다. ${result.skippedCount}건은 상태가 변경되어 이번 제출에서 제외되었습니다.`}
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto text-sm text-charcoal-3">
              {result.skippedBookings.map((skipped) => (
                <li key={skipped.bookingId}>{skippedRowLabel(skipped, bookingsById)}</li>
              ))}
            </ul>
          </>
        )}
        <div className="flex justify-end pt-1">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            확인
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
