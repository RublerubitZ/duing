import type { SubmissionCandidateBooking } from '@duing/types';

export type FacilitySection = {
  facilityId: number;
  /** 조회 결측 시 "시설 {id}" 폴백 — 라벨·정렬 모두 이 값을 쓴다(검색 폴백과 동일 원칙). */
  facilityName: string;
  bookings: SubmissionCandidateBooking[];
};

/** 시설별 섹션(스펙 v3 §7.2) — 준비 탭의 기본 골격. 시설명 오름차순(ko), 결측 라벨은 맨 뒤. */
export function buildFacilitySections(bookings: SubmissionCandidateBooking[]): FacilitySection[] {
  const byFacility = new Map<number, SubmissionCandidateBooking[]>();
  for (const booking of bookings) {
    const facilityBookings = byFacility.get(booking.facilityId) ?? [];
    facilityBookings.push(booking);
    byFacility.set(booking.facilityId, facilityBookings);
  }
  return [...byFacility.entries()]
    .map(([facilityId, facilityBookings]) => ({
      facilityId,
      facilityName: facilityBookings[0]?.facilityName ?? `시설 ${facilityId}`,
      bookings: facilityBookings,
    }))
    .sort((left, right) => {
      // TODO: 시설 표시 순서(displayOrder)가 도입되면 displayOrder → facilityName 순으로 확장한다.
      const leftMissing = left.facilityName.startsWith('시설 ');
      const rightMissing = right.facilityName.startsWith('시설 ');
      if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
      return left.facilityName.localeCompare(right.facilityName, 'ko');
    });
}

export type ClubFacilityGroup = {
  facilityId: number;
  facilityName: string;
  bookings: SubmissionCandidateBooking[];
};

export type ClubSection = {
  clubId: number;
  clubName: string | null;
  facilityGroups: ClubFacilityGroup[];
};

/**
 * 동아리 최상위 섹션(동아리 중심 보기 스펙 §1) — 동아리 → 시설 → 날짜/시간.
 * 동아리명 오름차순(ko, null 마지막·clubId 타이브레이크), 동아리 안은 buildFacilitySections 의
 * 시설 정렬을 재사용하고, 시설 안은 날짜→시간→id 로 정렬한다.
 */
export function buildClubSections(bookings: SubmissionCandidateBooking[]): ClubSection[] {
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
      facilityGroups: buildFacilitySections(clubBookings).map((section) => ({
        facilityId: section.facilityId,
        facilityName: section.facilityName,
        bookings: [...section.bookings].sort(
          (left, right) =>
            left.reservationDate.localeCompare(right.reservationDate) ||
            left.startTime.localeCompare(right.startTime) ||
            left.bookingId - right.bookingId,
        ),
      })),
    }))
    .sort((left, right) => {
      if (left.clubName === null && right.clubName === null) return left.clubId - right.clubId;
      if (left.clubName === null) return 1;
      if (right.clubName === null) return -1;
      return left.clubName.localeCompare(right.clubName, 'ko');
    });
}

/**
 * v3 선택 모델의 단일 파생 지점 — 선택 = 화면의 selectable − excluded.
 * 기본 전체 선택·재조회 유입분 자동 선택이 이 파생에서 자연히 성립한다(제외만 상태로 남는다).
 */
export function deriveSelectedIds(
  bookings: SubmissionCandidateBooking[],
  excludedIds: ReadonlySet<number>,
): number[] {
  return bookings
    .filter((booking) => booking.selectable && !excludedIds.has(booking.bookingId))
    .map((booking) => booking.bookingId);
}
