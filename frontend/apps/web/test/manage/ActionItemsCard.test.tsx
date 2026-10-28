import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DashboardTaskGroup } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a> }));

const mockQueue = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/hooks')>();
  return {
    // 변환 모듈이 쓰는 순수 유틸은 실제 구현을 쓴다.
    CLOSING_SOON_DAYS: actual.CLOSING_SOON_DAYS,
    formatRelativeTime: actual.formatRelativeTime,
    useDashboardTaskQueue: (clubId: number) => mockQueue(clubId),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

import { ActionItemsCard } from '@/app/manage/_components/dashboard/ActionItemsCard';

const groups: DashboardTaskGroup[] = [
  { key: 'NOW', tasks: [
    { source: 'RECRUITMENT', item: { type: 'INTERVIEW_RESULT_PENDING', recruitmentId: 1, recruitmentTitle: '아주 긴 이름의 2026학년도 2학기 신입 부원 정기 모집', count: 5 } },
    { source: 'OPERATION', item: { type: 'FEE_OVERDUE', count: 4 } },
  ] },
  { key: 'WAITING', tasks: [
    { source: 'OPERATION', item: { type: 'BANK_REVIEW_PENDING', count: 2 } },
  ] },
  { key: 'INFO', tasks: [
    { source: 'OPERATION', item: { type: 'FACILITY_BOOKING_ATTENTION', bookingId: 5, roomName: '학생회관 B103', date: '2026-11-04', startTime: '18:00:00', endTime: '20:00:00', status: 'REJECTED' } },
  ] },
];

describe('ActionItemsCard', () => {
  it('세 묶음을 머리글·건수와 함께, 묶음 순서대로 그린다', () => {
    mockQueue.mockReturnValue({ groups, totalCount: 4, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('처리 필요 업무')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(['지금 처리 2', '처리 대기 1', '확인만 1']);
  });

  it('행마다 링크 하나, 큐 안에 버튼 역할은 없다', () => {
    mockQueue.mockReturnValue({ groups, totalCount: 4, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/manage/clubs/10/recruitments/1/applicants',
      '/manage/clubs/10/fees?tab=bill&status=OVERDUE',
      '/manage/clubs/10/fees?tab=bank',
      '/manage/clubs/10/facility-bookings?tab=past',
    ]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(within(links[3]!).getByText('거절됨')).toBeInTheDocument();
    expect(within(links[3]!).getByText('예약 보기')).toBeInTheDocument();
    // 칩과 처리 문구는 한 묶음 — 따로 줄바꿈하면 행마다 처리 문구 자리가 달라진다.
    const chipGroup = within(links[3]!).getByText('거절됨').parentElement;
    expect(chipGroup).toBe(within(links[3]!).getByText('예약 보기').parentElement);
    expect(chipGroup).not.toBe(links[3]);
    // 행보다 넓으면 묶음 안에서 줄을 바꾼다 — 줄지도 감기지도 않으면 좁은 폭·큰 글씨에서 카드 밖으로 넘친다.
    expect(chipGroup).toHaveClass('flex-wrap', 'justify-end');
    expect(chipGroup).not.toHaveClass('shrink-0');
    // 칩 하나가 행보다 넓으면 칩 안에서 어절 단위로 감긴다 — 줄지 않으면 320px·130% 글씨에서 행 밖으로 나간다.
    const chip = within(links[3]!).getByText('거절됨');
    expect(chip).toHaveClass('max-w-full', 'break-keep');
    expect(chip).not.toHaveClass('shrink-0');
  });

  it('맥락 문구는 말줄임하지 않는다(모바일에서 모집명이 잘리지 않게)', () => {
    mockQueue.mockReturnValue({ groups, totalCount: 4, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    const context = screen.getByText('아주 긴 이름의 2026학년도 2학기 신입 부원 정기 모집 · 5명');
    expect(context).not.toHaveClass('truncate');
  });

  it('일부 실패면 항목은 남기고 배지·묶음 건수를 숨긴다', () => {
    mockQueue.mockReturnValue({ groups, totalCount: 4, isLoading: false, isError: true });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.queryByText('4')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['지금 처리', '처리 대기', '확인만']);
    expect(screen.getByText('회비 연체')).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('로딩 중에는 배지를 그리지 않는다', () => {
    mockQueue.mockReturnValue({ groups: [], totalCount: 2, isLoading: true, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });

  it('업무가 없으면 빈 상태', () => {
    mockQueue.mockReturnValue({ groups: [], totalCount: 0, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('처리할 업무가 없어요')).toBeInTheDocument();
  });

  it('조회에 실패해 0건이면 빈 상태 대신 오류 안내', () => {
    mockQueue.mockReturnValue({ groups: [], totalCount: 0, isLoading: false, isError: true });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('처리할 업무가 없어요')).not.toBeInTheDocument();
  });
});
