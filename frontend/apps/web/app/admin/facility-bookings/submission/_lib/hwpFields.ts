import type { SubmissionCandidateBooking } from '@duing/types';

/**
 * HWP 「시설물 사용 신청서」 전사용 필드 정의. 총동연 담당자가 승인된 예약을 학교 양식에 그대로 옮겨
 * 쓰는 화면(TranscribeCockpit)에서 쓴다. label·순서는 학교 양식(위→아래)과 동일하게 맞춘다.
 *
 * 값이 결측(null)인 필드는 담당자가 오인하지 않도록 '—' 로 표기한다(빈칸이 아니라 "값 없음"임을 명시).
 */
export type HwpField = {
  key: string;
  label: string;
  get: (booking: SubmissionCandidateBooking) => string;
};

const DASH = '—';

function whenOf(booking: SubmissionCandidateBooking): string {
  return `${booking.reservationDate} ${booking.startTime}~${booking.endTime}`;
}

export const HWP_FIELDS: HwpField[] = [
  { key: 'facility', label: '사용 시설명', get: (b) => b.facilityName ?? DASH },
  { key: 'when', label: '사용 일시', get: (b) => whenOf(b) },
  { key: 'club', label: '사용자(기관)', get: (b) => b.clubName ?? DASH },
  { key: 'attendee', label: '사용 인원', get: (b) => (b.attendeeCount != null ? `${b.attendeeCount}명` : DASH) },
  { key: 'purpose', label: '사용 목적', get: (b) => b.purpose },
  { key: 'dept', label: '신청자 소속', get: (b) => b.clubName ?? DASH },
  { key: 'applicant', label: '신청자 성명', get: (b) => b.applicantName ?? DASH },
  { key: 'contact', label: '대표 연락처', get: (b) => b.contactPhone ?? DASH },
];

/** 한 줄 복사 — 양식 순서대로 탭 구분. 표 셀에 한 번에 붙여넣는 용도. */
export function toTabLine(booking: SubmissionCandidateBooking): string {
  return HWP_FIELDS.map((field) => field.get(booking)).join('\t');
}

/** 전체 양식 복사 — `라벨: 값` 여러 줄. 신청서 한 건을 통째로 붙여넣는 용도. */
export function toFormBlock(booking: SubmissionCandidateBooking): string {
  return HWP_FIELDS.map((field) => `${field.label}: ${field.get(booking)}`).join('\n');
}

export type FacilityGroup = {
  facilityId: number;
  facilityName: string;
  items: SubmissionCandidateBooking[];
};

/**
 * 시설별 그룹핑 — 같은 시설의 예약을 한 묶음으로 모아 시설 단위 연속 전사를 돕는다.
 * 첫 등장 순서를 보존한다(정렬 재배치 없이 배치가 준 순서 그대로). 시설명 결측은 'facilityId'로 라벨.
 */
export function groupByFacility(bookings: SubmissionCandidateBooking[]): FacilityGroup[] {
  const groups: FacilityGroup[] = [];
  const indexByFacility = new Map<number, number>();
  for (const booking of bookings) {
    const existing = indexByFacility.get(booking.facilityId);
    if (existing === undefined) {
      indexByFacility.set(booking.facilityId, groups.length);
      groups.push({
        facilityId: booking.facilityId,
        facilityName: booking.facilityName ?? `시설 ${booking.facilityId}`,
        items: [booking],
      });
    } else {
      groups[existing]?.items.push(booking);
    }
  }
  return groups;
}
