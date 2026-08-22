import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockUseClubFeedCounts = vi.fn();
vi.mock('@duing/hooks', () => ({ useClubFeedCounts: (clubId: number) => mockUseClubFeedCounts(clubId) }) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { ClubFeedLinkCard } from '@/app/manage/_components/dashboard/ClubFeedLinkCard';

describe('ClubFeedLinkCard', () => {
  it('공지·일정 카운트가 있으면 숫자와 바로가기 링크를 표시한다', () => {
    mockUseClubFeedCounts.mockReturnValue({ noticeCount: 3, eventCount: 5, isLoading: false, isError: false });
    render(<ClubFeedLinkCard clubId={10} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /바로가기/ });
    expect(link).toHaveAttribute('href', '/clubs/10');
  });

  it('공지·일정이 모두 0이어도 빈 안내 문구와 바로가기 링크를 표시한다', () => {
    mockUseClubFeedCounts.mockReturnValue({ noticeCount: 0, eventCount: 0, isLoading: false, isError: false });
    render(<ClubFeedLinkCard clubId={10} />);
    expect(screen.getByText('아직 공지·일정이 없어요')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /바로가기/ });
    expect(link).toHaveAttribute('href', '/clubs/10');
  });
});
