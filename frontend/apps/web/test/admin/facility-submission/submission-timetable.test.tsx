import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import { SubmissionTimetable } from '../../../app/admin/facility-bookings/submission/_components/SubmissionTimetable';

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

describe('SubmissionTimetable', () => {
  it('블록에 동아리명·시간·인원이 함께 표시된다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('합주부')).toBeInTheDocument();
    expect(screen.getByText(/18:00~21:00/)).toBeInTheDocument();
    expect(screen.getByText(/30명/)).toBeInTheDocument();
  });

  it('인원이 없으면 사용목적을 대신 표시한다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking({ attendeeCount: null })]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/정기 합주/)).toBeInTheDocument();
  });

  it('선택 가능한 블록 클릭은 선택 토글을 호출하고 aria-pressed 로 상태를 알린다', () => {
    const onToggleSelect = vi.fn();
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set([1])}
        onToggleSelect={onToggleSelect}
        onShowDetail={vi.fn()}
      />,
    );

    const block = screen.getByRole('button', { name: /합주부/ });
    expect(block).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(block);
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it('선택 불가 블록(제출함) 클릭은 상세 열람을 호출한다', () => {
    const onShowDetail = vi.fn();
    const submitted = makeBooking({ submitted: true, selectable: false, submissionNo: 'SUB-20260801-001' });
    render(
      <SubmissionTimetable
        bookings={[submitted]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={onShowDetail}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /합주부/ }));
    expect(onShowDetail).toHaveBeenCalledWith(submitted);
  });

  it('hover 툴팁 내용(신청자·연락처·승인자)이 렌더된다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking()]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/홍길동/)).toBeInTheDocument();
    expect(screen.getByText(/010-1234-5678/)).toBeInTheDocument();
    expect(screen.getByText(/관리자/)).toBeInTheDocument();
  });

  it('CONFIRMED 블록에는 등록완료 뱃지가 붙는다', () => {
    render(
      <SubmissionTimetable
        bookings={[makeBooking({ status: 'CONFIRMED', selectable: false })]}
        facilityName="커뮤니티룸(1)"
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText('등록완료')).toBeInTheDocument();
  });
});
