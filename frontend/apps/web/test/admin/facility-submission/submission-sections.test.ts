import { describe, expect, it } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import {
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
    ]);

    expect(sections.map((section) => section.facilityName)).toEqual(['강당', '시설 300']);
  });

  it('빈 입력은 빈 섹션 배열을 낸다', () => {
    expect(buildFacilitySections([])).toEqual([]);
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
