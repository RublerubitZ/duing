import type { SubmissionCandidateBooking } from '@duing/types';

export type SubmissionClubGroup = {
  clubId: number;
  clubName: string | null;
  bookings: SubmissionCandidateBooking[];
};

/**
 * 동아리별 그룹핑(스펙 v2 §7.1) — 월간 제출 업무의 기본 화면 단위.
 * 동아리명 오름차순(null 은 마지막), 그룹 내 날짜→시간→id 정렬.
 */
export function buildClubGroups(bookings: SubmissionCandidateBooking[]): SubmissionClubGroup[] {
  const byClub = new Map<number, SubmissionCandidateBooking[]>();
  for (const booking of bookings) {
    const clubBookings = byClub.get(booking.clubId) ?? [];
    clubBookings.push(booking);
    byClub.set(booking.clubId, clubBookings);
  }
  return [...byClub.entries()]
    .map(([clubId, clubBookings]) => ({
      clubId,
      clubName: clubBookings[0]?.clubName ?? null,
      bookings: [...clubBookings].sort(
        (left, right) =>
          left.reservationDate.localeCompare(right.reservationDate) ||
          left.startTime.localeCompare(right.startTime) ||
          left.bookingId - right.bookingId,
      ),
    }))
    .sort((left, right) => {
      if (left.clubName === null) return 1;
      if (right.clubName === null) return -1;
      return left.clubName.localeCompare(right.clubName, 'ko');
    });
}
