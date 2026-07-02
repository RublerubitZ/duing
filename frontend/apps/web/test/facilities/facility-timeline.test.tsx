import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservationSlot } from '@duing/types';
import { FacilityTimeline } from '../../app/facilities/_components/FacilityTimeline';

const reservations: ReservationSlot[] = [
  { date: '2026-07-01', start: '09:00', end: '11:00', organization: '고정관념', status: 'USING' },
  { date: '2026-07-02', start: '16:00', end: '17:00', organization: '댄스동아리', status: 'UPCOMING' },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 2026-07-01 11:20 KST (= 02:20 UTC) → 기본 선택일 1일.
  vi.setSystemTime(new Date('2026-07-01T02:20:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FacilityTimeline', () => {
  it('오늘(1일)의 예약 구간 버튼을 렌더한다', () => {
    render(<FacilityTimeline reservations={reservations} yearMonth="2026-07" />);
    expect(screen.getByRole('button', { name: '고정관념 예약' })).toBeInTheDocument();
  });

  it('예약 구간 클릭 시 사용 단체·시간을 표시한다', () => {
    render(<FacilityTimeline reservations={reservations} yearMonth="2026-07" />);
    fireEvent.click(screen.getByRole('button', { name: '고정관념 예약' }));
    expect(screen.getByText(/09:00 ~ 11:00/)).toBeInTheDocument();
    expect(screen.getByText(/단체 고정관념/)).toBeInTheDocument();
  });

  it('다른 날짜(2일) 선택 시 해당일 예약으로 전환된다', () => {
    render(<FacilityTimeline reservations={reservations} yearMonth="2026-07" />);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(screen.getByRole('button', { name: '댄스동아리 예약' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '고정관념 예약' })).toBeNull();
  });
});
