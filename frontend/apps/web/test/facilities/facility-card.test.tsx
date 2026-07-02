import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacilityItem } from '@duing/types';
import { FacilityCard } from '../../app/facilities/_components/FacilityCard';

const base: FacilityItem = {
  id: 12,
  roomName: '공동연습실(1)',
  location: '2105',
  isUsingNow: false,
  currentReservation: null,
  nextReservation: null,
  reservations: [],
};

// 다음 예약 라벨이 '오늘' 여부에 따라 달라지므로 시각을 고정한다(2026-07-02 11:20 KST).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-02T02:20:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FacilityCard', () => {
  it('사용 중이면 "현재 사용 중" + 현재 예약 시간·단체를 표시한다', () => {
    render(
      <FacilityCard
        facility={{
          ...base,
          isUsingNow: true,
          currentReservation: {
            date: '2026-07-01',
            start: '09:00',
            end: '11:00',
            organization: '댄스동아리',
            status: 'USING',
          },
        }}
      />,
    );
    expect(screen.getByText('현재 사용 중')).toBeInTheDocument();
    expect(screen.getByText(/09:00~11:00/)).toBeInTheDocument();
    expect(screen.getByText(/댄스동아리/)).toBeInTheDocument();
  });

  it('이용 가능 + 다음 예약이 있으면 "현재 이용 가능"과 다음 예약을 표시한다', () => {
    render(
      <FacilityCard
        facility={{
          ...base,
          nextReservation: {
            date: '2026-07-02',
            start: '16:00',
            end: '17:00',
            organization: '고정관념',
            status: 'UPCOMING',
          },
        }}
      />,
    );
    expect(screen.getByText('현재 이용 가능')).toBeInTheDocument();
    expect(screen.getByText(/다음 예약 16:00~17:00 · 고정관념/)).toBeInTheDocument();
  });

  it('다음 예약이 오늘이 아니면 날짜(M\\/D)를 함께 표기해 오늘 예약으로 오인되지 않게 한다', () => {
    render(
      <FacilityCard
        facility={{
          ...base,
          nextReservation: {
            date: '2026-07-04',
            start: '16:00',
            end: '17:00',
            organization: '고정관념',
            status: 'UPCOMING',
          },
        }}
      />,
    );
    expect(screen.getByText(/다음 예약 7\/4 16:00~17:00 · 고정관념/)).toBeInTheDocument();
  });

  it('이용 가능 + 다음 예약이 없으면 안내 문구를 표시한다', () => {
    render(<FacilityCard facility={base} />);
    expect(screen.getByText('현재 이용 가능')).toBeInTheDocument();
    expect(screen.getByText('예정된 예약이 없어요')).toBeInTheDocument();
  });

  it('상세보기 링크가 /facilities/{id} 로 향한다', () => {
    render(<FacilityCard facility={base} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/facilities/12');
    expect(screen.getByText(/상세보기/)).toBeInTheDocument();
  });
});
