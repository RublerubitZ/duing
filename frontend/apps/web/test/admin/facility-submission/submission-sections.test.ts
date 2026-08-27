import { describe, expect, it } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import {
  buildClubSections,
  buildFacilitySections,
  deriveSelectedIds,
} from '../../../app/admin/facility-bookings/submission/_lib/submissionSections';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    facilityId: 100,
    facilityName: '강당',
    clubId: 10,
    clubName: '밴드부',
    applicantName: '홍길동',
    contactPhone: '010-1234-5678',
    reservationDate: '2026-08-01',
    startTime: '18:00',
    endTime: '21:00',
    purpose: '정기 합주',
    attendeeCount: 30,
    status: 'APPROVED',
    submitted: false,
    selectable: true,
    submissionNo: null,
    decidedByName: '관리자',
    decidedAt: '2026-07-20T10:00:00',
    ...overrides,
  };
}

describe('buildFacilitySections', () => {
  it('시설별로 묶고 시설명 오름차순으로 정렬한다', () => {
    const sections = buildFacilitySections([
      makeBooking({ bookingId: 1, facilityId: 200, facilityName: '세미나실' }),
      makeBooking({ bookingId: 2, facilityId: 100, facilityName: '강당' }),
      makeBooking({ bookingId: 3, facilityId: 200, facilityName: '세미나실' }),
    ]);

    expect(sections.map((section) => section.facilityName)).toEqual(['강당', '세미나실']);
    expect(sections[1]!.bookings).toHaveLength(2);
  });

  it('시설명이 없으면 폴백 라벨로 표시하고 맨 뒤로 정렬한다', () => {
    const sections = buildFacilitySections([
      makeBooking({ bookingId: 1, facilityId: 300, facilityName: null }),
      makeBooking({ bookingId: 2, facilityId: 100, facilityName: '강당' }),
      // ko collation 상 '체육관'(ㅊ)은 '시설 300'(ㅅ)보다 뒤에 온다 — 가드 없이 순수 localeCompare만 쓰면
      // 폴백이 실명 시설보다 앞에 와버려 "폴백은 맨 뒤" 계약이 깨진다.
      makeBooking({ bookingId: 3, facilityId: 400, facilityName: '체육관' }),
    ]);

    expect(sections.map((section) => section.facilityName)).toEqual(['강당', '체육관', '시설 300']);
  });

  it('빈 입력은 빈 섹션 배열을 낸다', () => {
    expect(buildFacilitySections([])).toEqual([]);
  });
});

describe('buildClubSections', () => {
  it('동아리명 오름차순(ko)으로 정렬하고, null 동아리명은 마지막에 온다', () => {
    const sections = buildClubSections([
      makeBooking({ bookingId: 1, clubId: 30, clubName: '바람' }),
      makeBooking({ bookingId: 2, clubId: 40, clubName: null }),
      makeBooking({ bookingId: 3, clubId: 20, clubName: '가온' }),
    ]);

    expect(sections.map((section) => section.clubName)).toEqual(['가온', '바람', null]);
    expect(sections.map((section) => section.clubId)).toEqual([20, 30, 40]);
  });

  it('동아리 안에서 같은 시설의 여러 날짜 예약이 한 시설 그룹으로 묶이고 날짜→시간→id 로 정렬된다', () => {
    const sections = buildClubSections([
      makeBooking({ bookingId: 1, facilityId: 500, facilityName: '공연장', reservationDate: '2026-08-03' }),
      // 같은 날짜·같은 시간 → bookingId 로 타이브레이크
      makeBooking({ bookingId: 5, facilityId: 500, facilityName: '공연장', reservationDate: '2026-08-01', startTime: '10:00' }),
      makeBooking({ bookingId: 4, facilityId: 500, facilityName: '공연장', reservationDate: '2026-08-01', startTime: '10:00' }),
      // 같은 날짜·다른 시간 → 시간 오름차순
      makeBooking({ bookingId: 2, facilityId: 500, facilityName: '공연장', reservationDate: '2026-08-01', startTime: '09:00' }),
      makeBooking({ bookingId: 3, facilityId: 600, facilityName: '강의실', reservationDate: '2026-08-02' }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.facilityGroups).toHaveLength(2);
    const hallGroup = sections[0]!.facilityGroups.find((group) => group.facilityName === '공연장')!;
    expect(hallGroup.bookings.map((booking) => booking.bookingId)).toEqual([2, 4, 5, 1]);
  });

  it('동아리 안의 시설 그룹은 시설명 오름차순(ko)이고, 결측 시설 라벨은 마지막에 온다', () => {
    const sections = buildClubSections([
      makeBooking({ bookingId: 1, facilityId: 300, facilityName: null }),
      makeBooking({ bookingId: 2, facilityId: 400, facilityName: '체육관' }),
      makeBooking({ bookingId: 3, facilityId: 100, facilityName: '강당' }),
    ]);

    expect(sections).toHaveLength(1);
    expect(sections[0]!.facilityGroups.map((group) => group.facilityName)).toEqual([
      '강당',
      '체육관',
      '시설 300',
    ]);
  });
});

describe('deriveSelectedIds', () => {
  const bookings = [
    makeBooking({ bookingId: 1 }),
    makeBooking({ bookingId: 2 }),
    makeBooking({ bookingId: 3, status: 'PENDING', selectable: false }),
  ];

  it('제출 필요 예약은 기본 전체 선택이다(제외 없음)', () => {
    expect(deriveSelectedIds(bookings, new Set())).toEqual([1, 2]);
  });

  it('제외한 예약만 선택에서 빠지고, 선택 불가 예약은 애초에 포함되지 않는다', () => {
    expect(deriveSelectedIds(bookings, new Set([2, 3]))).toEqual([1]);
  });

  it('재조회로 유입된 신규 예약은 자동으로 선택에 포함된다', () => {
    const withNewBooking = [...bookings, makeBooking({ bookingId: 9 })];
    expect(deriveSelectedIds(withNewBooking, new Set([2]))).toEqual([1, 9]);
  });
});
