import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { TodayScheduleItem } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockUseTodaySchedule = vi.fn();
vi.mock('@duing/hooks', () => ({ useTodaySchedule: (clubId: number) => mockUseTodaySchedule(clubId) }));

import { TodayScheduleCard } from '@/app/manage/_components/dashboard/TodayScheduleCard';

describe('TodayScheduleCard', () => {
  it('일정이 없으면 빈 상태를 표시한다', () => {
    mockUseTodaySchedule.mockReturnValue({ items: [], isLoading: false, isError: false });
    render(<TodayScheduleCard clubId={1} />);
    expect(screen.getByText('오늘 일정이 없어요')).toBeInTheDocument();
  });

  it('INTERVIEW 아이템은 라운드 경로로 링크를 렌더한다', () => {
    const item: TodayScheduleItem = {
      kind: 'INTERVIEW',
      title: '1차 면접',
      startAt: '2026-06-12T14:00:00+09:00',
      endAt: '2026-06-12T15:00:00+09:00',
      location: '301호',
      recruitmentId: 5,
      roundId: 7,
      slotId: 1,
    };
    mockUseTodaySchedule.mockReturnValue({ items: [item], isLoading: false, isError: false });
    render(<TodayScheduleCard clubId={1} />);
    expect(screen.getByText('1차 면접')).toBeInTheDocument();
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/manage/clubs/1/recruitments/5/interview/rounds/7');
  });

  it('EVENT 아이템은 링크 없이 제목을 렌더한다', () => {
    const item: TodayScheduleItem = {
      kind: 'EVENT',
      title: '정기모임',
      startAt: '2026-06-12T19:00:00+09:00',
      endAt: '2026-06-12T21:00:00+09:00',
      location: '동방',
      eventId: 50,
    };
    mockUseTodaySchedule.mockReturnValue({ items: [item], isLoading: false, isError: false });
    render(<TodayScheduleCard clubId={1} />);
    expect(screen.getByText('정기모임')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
