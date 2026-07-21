import { describe, expect, it } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';

import {
  HWP_FIELDS,
  groupByFacility,
  toFormBlock,
  toTabLine,
} from '@/app/admin/facility-bookings/submission/_lib/hwpFields';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    facilityId: 10,
    facilityName: '세미나실 A',
    clubId: 100,
    clubName: '밴드부',
    applicantName: '홍길동',
    contactPhone: '010-1234-5678',
    reservationDate: '2026-08-10',
    startTime: '18:00',
    endTime: '20:00',
    purpose: '정기 합주',
    attendeeCount: 15,
    status: 'APPROVED',
    submitted: false,
    selectable: true,
    submissionNo: null,
    decidedByName: '관리자',
    decidedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('HWP_FIELDS', () => {
  it('학교 양식 순서(시설·일시·사용자·인원·목적·소속·성명·연락처)대로 값을 낸다', () => {
    const booking = makeBooking();
    const rendered = HWP_FIELDS.map((field) => [field.label, field.get(booking)]);
    expect(rendered).toEqual([
      ['사용 시설명', '세미나실 A'],
      ['사용 일시', '2026-08-10 18:00~20:00'],
      ['사용자(기관)', '밴드부'],
      ['사용 인원', '15명'],
      ['사용 목적', '정기 합주'],
      ['신청자 소속', '밴드부'],
      ['신청자 성명', '홍길동'],
      ['대표 연락처', '010-1234-5678'],
    ]);
  });

  it('결측 값은 빈칸이 아니라 대시(—)로 표기해 값 없음을 명시한다', () => {
    const booking = makeBooking({
      facilityName: null,
      clubName: null,
      applicantName: null,
      contactPhone: null,
      attendeeCount: null,
    });
    const byKey = Object.fromEntries(HWP_FIELDS.map((field) => [field.key, field.get(booking)]));
    expect(byKey.facility).toBe('—');
    expect(byKey.club).toBe('—');
    expect(byKey.attendee).toBe('—');
    expect(byKey.applicant).toBe('—');
    expect(byKey.contact).toBe('—');
    // 일시·목적은 결측 개념이 아니라 항상 값이 있다.
    expect(byKey.when).toBe('2026-08-10 18:00~20:00');
  });
});

describe('복사 포매터', () => {
  it('toTabLine 은 양식 순서대로 탭으로 잇는다', () => {
    expect(toTabLine(makeBooking())).toBe(
      '세미나실 A\t2026-08-10 18:00~20:00\t밴드부\t15명\t정기 합주\t밴드부\t홍길동\t010-1234-5678',
    );
  });

  it('toFormBlock 은 라벨: 값 여러 줄로 신청서 한 건을 통째로 낸다', () => {
    expect(toFormBlock(makeBooking())).toBe(
      [
        '사용 시설명: 세미나실 A',
        '사용 일시: 2026-08-10 18:00~20:00',
        '사용자(기관): 밴드부',
        '사용 인원: 15명',
        '사용 목적: 정기 합주',
        '신청자 소속: 밴드부',
        '신청자 성명: 홍길동',
        '대표 연락처: 010-1234-5678',
      ].join('\n'),
    );
  });
});

describe('groupByFacility', () => {
  it('시설별로 묶되 첫 등장 순서를 보존한다', () => {
    const groups = groupByFacility([
      makeBooking({ bookingId: 1, facilityId: 10, facilityName: '세미나실 A' }),
      makeBooking({ bookingId: 2, facilityId: 20, facilityName: '강당' }),
      makeBooking({ bookingId: 3, facilityId: 10, facilityName: '세미나실 A' }),
    ]);
    expect(groups.map((g) => [g.facilityName, g.items.length])).toEqual([
      ['세미나실 A', 2],
      ['강당', 1],
    ]);
  });

  it('시설명이 결측이면 facilityId 로 라벨한다', () => {
    const groups = groupByFacility([makeBooking({ facilityId: 77, facilityName: null })]);
    expect(groups[0]?.facilityName).toBe('시설 77');
  });
});
