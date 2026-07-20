import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidateBooking } from '@duing/types';
import { buildClubGroups } from '../../../app/admin/facility-bookings/submission/_lib/submissionGroups';
import { SubmissionClubGroupList } from '../../../app/admin/facility-bookings/submission/_components/SubmissionClubGroupList';

function makeBooking(overrides: Partial<SubmissionCandidateBooking> = {}): SubmissionCandidateBooking {
  return {
    bookingId: 1,
    facilityId: 1,
    facilityName: '학생회관 세미나실',
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

describe('buildClubGroups', () => {
  it('동아리명 오름차순으로 그룹핑하고 그룹 안은 날짜→시간 순으로 정렬한다', () => {
    const groups = buildClubGroups([
      makeBooking({ bookingId: 3, clubId: 11, clubName: '방송국', startTime: '09:00', endTime: '10:00' }),
      makeBooking({ bookingId: 2, reservationDate: '2026-08-08' }),
      makeBooking({ bookingId: 1 }),
    ]);

    // 한글 오름차순: '방'(U+BC29) < '밴'(U+BC34) — 초성 ㅂ 동률 후 중성 ㅏ < ㅐ.
    expect(groups.map((group) => group.clubName)).toEqual(['방송국', '밴드부']);
    const bandGroup = groups.find((group) => group.clubName === '밴드부');
    expect(bandGroup!.bookings.map((booking) => booking.bookingId)).toEqual([1, 2]);
  });

  it('빈 입력은 빈 그룹 배열을 낸다', () => {
    expect(buildClubGroups([])).toEqual([]);
  });
});

describe('SubmissionClubGroupList', () => {
  const twoClubs = [
    makeBooking({ bookingId: 1 }),
    makeBooking({ bookingId: 2, reservationDate: '2026-08-08' }),
    makeBooking({ bookingId: 3, clubId: 11, clubName: '방송국', submitted: true, selectable: false, submissionNo: 'SUB-20260801-001' }),
  ];

  it('동아리별 그룹 헤더에 이름·건수·선택 수가 표시된다', () => {
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set([1])}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByText(/밴드부/)).toBeInTheDocument();
    expect(screen.getByText(/2건 · 선택 1/)).toBeInTheDocument();
    expect(screen.getByText(/방송국/)).toBeInTheDocument();
    expect(screen.getByText(/1건/)).toBeInTheDocument();
  });

  it('그룹 헤더 체크박스는 그 동아리의 선택 가능 예약 전체를 일괄 토글한다', () => {
    const onToggleMany = vi.fn();
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={onToggleMany}
        onShowDetail={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '밴드부 전체 선택' }));
    expect(onToggleMany).toHaveBeenCalledWith([1, 2], true);
  });

  it('그룹 헤더 체크박스는 부분 선택 시 indeterminate, 전체 선택 시 checked 이다', () => {
    const { rerender } = render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set([1])}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    const headerCheckbox = screen.getByRole('checkbox', { name: '밴드부 전체 선택' });
    if (!(headerCheckbox instanceof HTMLInputElement)) throw new Error('checkbox 는 input 요소여야 한다');
    expect(headerCheckbox.indeterminate).toBe(true);
    expect(headerCheckbox.checked).toBe(false);

    rerender(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set([1, 2])}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    const headerCheckboxAfterFullSelect = screen.getByRole('checkbox', { name: '밴드부 전체 선택' });
    if (!(headerCheckboxAfterFullSelect instanceof HTMLInputElement)) throw new Error('checkbox 는 input 요소여야 한다');
    expect(headerCheckboxAfterFullSelect.checked).toBe(true);
    expect(headerCheckboxAfterFullSelect.indeterminate).toBe(false);
  });

  it('그룹 헤더 체크박스 클릭은 접기/펼치기와 별개 컨트롤이라 접힘을 유발하지 않는다', () => {
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: '밴드부 전체 선택' }));

    const bandToggle = screen.getByRole('button', { name: /밴드부/ });
    expect(bandToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).toBeInTheDocument();
  });

  it('선택 가능 예약이 없는 그룹의 헤더 체크박스는 비활성이다', () => {
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    expect(screen.getByRole('checkbox', { name: '방송국 전체 선택' })).toBeDisabled();
  });

  it('행 체크박스는 selectable 만 활성이고 개별 토글을 호출한다', () => {
    const onToggleSelect = vi.fn();
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={onToggleSelect}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    const submittedRow = screen.getByRole('checkbox', { name: /방송국 2026-08-01 18:00 선택/ });
    expect(submittedRow).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    expect(onToggleSelect).toHaveBeenCalledWith(1);
  });

  it('그룹 접기 버튼은 행을 숨기고 aria-expanded 를 갱신한다', () => {
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={vi.fn()}
      />,
    );

    const bandToggle = screen.getByRole('button', { name: /밴드부/ });
    expect(bandToggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(bandToggle);
    expect(bandToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).not.toBeInTheDocument();
  });

  it('행에 제출 업무 정보(요일 포함 예약일·시간·목적·인원·제출번호)가 표시되고 상세 버튼이 동작한다', () => {
    const onShowDetail = vi.fn();
    render(
      <SubmissionClubGroupList
        bookings={twoClubs}
        selection={new Set()}
        onToggleSelect={vi.fn()}
        onToggleMany={vi.fn()}
        onShowDetail={onShowDetail}
      />,
    );

    expect(screen.getAllByText(/08-01\(토\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/18:00~21:00/).length).toBeGreaterThan(0);
    expect(screen.getByText('SUB-20260801-001')).toBeInTheDocument();

    const bandGroup = screen.getByRole('group', { name: /밴드부/ });
    fireEvent.click(within(bandGroup).getAllByRole('button', { name: '상세' })[0]!);
    expect(onShowDetail).toHaveBeenCalledWith(twoClubs[0]);
  });
});
