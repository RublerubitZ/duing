import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FacilityItem } from '@duing/types';
import { FacilityOverviewTimeline } from '../../app/facilities/_components/FacilityOverviewTimeline';

const base: FacilityItem = {
  id: 12,
  roomName: '공동연습실(1)',
  location: '2105',
  isUsingNow: false,
  currentReservation: null,
  nextReservation: null,
  reservations: [],
};

// 오늘 필터·다음 예약 날짜 병기가 '오늘' 기준이므로 시각을 고정한다(2026-07-02 11:20 KST).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-02T02:20:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('FacilityOverviewTimeline', () => {
  it('시설마다 행을 렌더하고 행 클릭 시 onSelectFacility 로 해당 시설 id 를 전달한다', () => {
    const onSelectFacility = vi.fn();
    render(
      <FacilityOverviewTimeline
        facilities={[base, { ...base, id: 34, roomName: '합주실', location: null }]}
        onSelectFacility={onSelectFacility}
      />,
    );
    const firstRow = screen.getByRole('button', { name: '공동연습실(1) 선택' });
    const secondRow = screen.getByRole('button', { name: '합주실 선택' });
    expect(firstRow).toBeInTheDocument();
    expect(secondRow).toBeInTheDocument();

    fireEvent.click(firstRow);
    expect(onSelectFacility).toHaveBeenCalledWith(12);
    fireEvent.click(secondRow);
    expect(onSelectFacility).toHaveBeenCalledWith(34);
  });

  it('오늘 예약만 세그먼트로 그리고 다른 날짜 예약은 제외한다', () => {
    render(
      <FacilityOverviewTimeline
        facilities={[
          {
            ...base,
            reservations: [
              { date: '2026-07-02', start: '09:00', end: '11:00', organization: '고정관념', status: 'FINISHED' },
              { date: '2026-07-03', start: '16:00', end: '17:00', organization: '댄스동아리', status: 'UPCOMING' },
            ],
          },
        ]}
        onSelectFacility={() => {}}
      />,
    );
    expect(screen.getByTitle('고정관념 09:00~11:00')).toBeInTheDocument();
    expect(screen.queryByTitle('댄스동아리 16:00~17:00')).toBeNull();
  });

  it('사용 중이면 "사용중", 아니면 "이용가능" 상태를 표시한다', () => {
    render(
      <FacilityOverviewTimeline
        facilities={[
          {
            ...base,
            isUsingNow: true,
            currentReservation: {
              date: '2026-07-02',
              start: '11:00',
              end: '12:00',
              organization: '밴드',
              status: 'USING',
            },
          },
          { ...base, id: 34, roomName: '합주실' },
        ]}
        onSelectFacility={() => {}}
      />,
    );
    expect(screen.getByText('사용중')).toBeInTheDocument();
    expect(screen.getByText('이용가능')).toBeInTheDocument();
  });

  it('사용 중이면 정보 줄에 현재 사용 단체와 시간을 표기한다', () => {
    render(
      <FacilityOverviewTimeline
        facilities={[
          {
            ...base,
            isUsingNow: true,
            currentReservation: {
              date: '2026-07-02',
              start: '11:00',
              end: '12:00',
              organization: '밴드',
              status: 'USING',
            },
          },
          {
            ...base,
            id: 34,
            roomName: '합주실',
            location: null,
            isUsingNow: true,
            currentReservation: {
              date: '2026-07-02',
              start: '10:00',
              end: '13:00',
              organization: '고정관념',
              status: 'USING',
            },
          },
        ]}
        onSelectFacility={() => {}}
      />,
    );
    expect(screen.getByText('2105 · 밴드 11:00~12:00 사용 중')).toBeInTheDocument();
    // location 이 없으면 구분점 없이 사용 중 정보만 표기한다.
    expect(screen.getByText('고정관념 10:00~13:00 사용 중')).toBeInTheDocument();
  });

  it('다음 예약이 오늘이면 시간만, 다른 날이면 M/D 를 병기하고 단체명을 함께 표기한다', () => {
    render(
      <FacilityOverviewTimeline
        facilities={[
          {
            ...base,
            nextReservation: {
              date: '2026-07-02',
              start: '16:00',
              end: '17:00',
              organization: '고정관념',
              status: 'UPCOMING',
            },
          },
          {
            ...base,
            id: 34,
            roomName: '합주실',
            nextReservation: {
              date: '2026-07-04',
              start: '16:00',
              end: '17:00',
              organization: '밴드',
              status: 'UPCOMING',
            },
          },
        ]}
        onSelectFacility={() => {}}
      />,
    );
    expect(screen.getByText('2105 · 다음 예약 16:00~17:00 · 고정관념')).toBeInTheDocument();
    expect(screen.getByText('2105 · 다음 예약 7/4 16:00~17:00 · 밴드')).toBeInTheDocument();
  });

  it('다음 예약이 없으면 안내 문구를 표시한다', () => {
    render(<FacilityOverviewTimeline facilities={[base]} onSelectFacility={() => {}} />);
    expect(screen.getByText(/예정된 예약이 없어요/)).toBeInTheDocument();
  });
});
