import { describe, expect, it } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import {
  SUBMISSION_HOURS,
  buildSubmissionRows,
  submissionBlockVisual,
} from '../../../app/admin/facility-bookings/submission/_lib/submissionTimetable';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    facilityId: 1,
    facilityName: '학생회관 세미나실',
    clubId: 10,
    clubName: '합주부',
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

describe('buildSubmissionRows', () => {
  it('시간축은 09~21 시작시각 13칸이다', () => {
    expect(SUBMISSION_HOURS).toHaveLength(13);
    expect(SUBMISSION_HOURS[0]).toBe(9);
    expect(SUBMISSION_HOURS[12]).toBe(21);
  });

  it('18~21시 예약은 colSpan 3 블록이 되고 덮인 칸은 covered 로 표시된다', () => {
    const rows = buildSubmissionRows([makeBooking()]);

    expect(rows).toHaveLength(1);
    const entries = rows[0]!.entries;
    expect(entries).toHaveLength(13);
    const blockIndex = 18 - 9;
    expect(entries[blockIndex]).toMatchObject({ type: 'block', colSpan: 3 });
    expect(entries[blockIndex + 1]).toEqual({ type: 'covered' });
    expect(entries[blockIndex + 2]).toEqual({ type: 'covered' });
    expect(entries[blockIndex + 3]).toEqual({ type: 'empty' });
  });

  it('예약이 있는 날짜만 행이 되고 날짜 오름차순으로 정렬된다', () => {
    const rows = buildSubmissionRows([
      makeBooking({ bookingId: 2, reservationDate: '2026-08-03', startTime: '09:00', endTime: '10:00' }),
      makeBooking({ bookingId: 1, reservationDate: '2026-08-01' }),
    ]);

    expect(rows.map((row) => row.dateIso)).toEqual(['2026-08-01', '2026-08-03']);
  });

  it('같은 날 시간이 겹치는 뒤 블록은 빈 구간에 맞춰 축소 배치된다(대기 vs 승인 공존)', () => {
    const rows = buildSubmissionRows([
      makeBooking({ bookingId: 1, startTime: '10:00', endTime: '12:00' }),
      makeBooking({ bookingId: 2, status: 'PENDING', selectable: false, startTime: '11:00', endTime: '13:00' }),
    ]);

    const entries = rows[0]!.entries;
    expect(entries[1]).toMatchObject({ type: 'block', colSpan: 2 }); // 10~12
    // 11~13 중 11~12 는 선점됨 → 12~13 한 칸으로 축소
    expect(entries[3]).toMatchObject({ type: 'block', colSpan: 1 });

    const frontBlock = entries[1];
    if (!frontBlock || frontBlock.type !== 'block') throw new Error('entries[1] 은 block 이어야 한다');
    expect(frontBlock.booking.bookingId).toBe(1);

    const shrunkBlock = entries[3];
    if (!shrunkBlock || shrunkBlock.type !== 'block') throw new Error('entries[3] 은 block 이어야 한다');
    expect(shrunkBlock.booking.bookingId).toBe(2);
  });

  it('09시 이전·22시 이후 구간은 시간축으로 클램프된다', () => {
    const rows = buildSubmissionRows([
      makeBooking({ startTime: '08:00', endTime: '10:00' }),
    ]);

    expect(rows[0]!.entries[0]).toMatchObject({ type: 'block', colSpan: 1 }); // 09~10 만
  });

  it('21시 시작 예약은 마지막 칸(entries[12])에 colSpan 1 블록으로 들어간다', () => {
    const rows = buildSubmissionRows([makeBooking({ startTime: '21:00', endTime: '22:00' })]);

    expect(rows[0]!.entries[12]).toMatchObject({ type: 'block', colSpan: 1 });
  });

  it('22시를 넘는 종료 시각은 22시로 클램프되어 entries[11] 이 colSpan 2 블록이 된다', () => {
    const rows = buildSubmissionRows([makeBooking({ startTime: '20:00', endTime: '23:00' })]);

    expect(rows[0]!.entries[11]).toMatchObject({ type: 'block', colSpan: 2 });
  });

  it('빈 배열을 넣으면 빈 행 배열을 반환한다', () => {
    expect(buildSubmissionRows([])).toEqual([]);
  });
});

describe('submissionBlockVisual', () => {
  it('선택 가능(미제출 APPROVED)은 ink 강조·뱃지 없음', () => {
    const visual = submissionBlockVisual(makeBooking());
    expect(visual.container).toContain('border-ink');
    expect(visual.badge).toBeNull();
  });

  it('제출 완료는 sage 계열이고 CONFIRMED 는 「등록완료」 뱃지가 붙는다', () => {
    expect(submissionBlockVisual(makeBooking({ submitted: true, selectable: false })).container).toContain('sage');
    expect(submissionBlockVisual(makeBooking({ status: 'CONFIRMED', selectable: false })).badge).toBe('등록완료');
  });

  it('PENDING 은 회색, CANCELLED 는 coral 소거, CONFLICT 는 warm+「충돌」이다', () => {
    expect(submissionBlockVisual(makeBooking({ status: 'PENDING', selectable: false })).container).toContain('graysoft');
    expect(submissionBlockVisual(makeBooking({ status: 'CANCELLED', selectable: false })).container).toContain('coral');
    const conflict = submissionBlockVisual(makeBooking({ status: 'CONFLICT', selectable: false }));
    expect(conflict.container).toContain('warm');
    expect(conflict.badge).toBe('충돌');
  });

  it('제출 후 취소된 예약(CANCELLED+submitted)은 취소 톤이 우선한다', () => {
    const visual = submissionBlockVisual(makeBooking({ status: 'CANCELLED', submitted: true, selectable: false }));
    expect(visual.container).toContain('coral');
    expect(visual.badge).toBeNull();
  });

  it('충돌 상태는 제출 여부와 무관하게 충돌 톤·뱃지가 우선한다', () => {
    const visual = submissionBlockVisual(makeBooking({ status: 'CONFLICT', submitted: true, selectable: false }));
    expect(visual.container).toContain('warm');
    expect(visual.badge).toBe('충돌');
  });
});
