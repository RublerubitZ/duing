import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => <a href={href} className={className}>{children}</a> }));
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
    // 글자 높이(약 16px)만으로는 손가락으로 누르기 어렵다 — 터치 영역 44px.
    expect(link).toHaveClass('min-h-11');
  });

  it('공지·일정이 모두 0이어도 빈 안내 문구와 바로가기 링크를 표시한다', () => {
    mockUseClubFeedCounts.mockReturnValue({ noticeCount: 0, eventCount: 0, isLoading: false, isError: false });
    render(<ClubFeedLinkCard clubId={10} />);
    expect(screen.getByText('아직 공지·일정이 없어요')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /바로가기/ });
    expect(link).toHaveAttribute('href', '/clubs/10');
    expect(screen.queryByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).not.toBeInTheDocument();
  });

  it('조회에 실패해 두 수가 모두 0이면 빈 안내 문구 대신 오류 안내를 표시하고 바로가기는 남긴다', () => {
    mockUseClubFeedCounts.mockReturnValue({ noticeCount: 0, eventCount: 0, isLoading: false, isError: true });
    render(<ClubFeedLinkCard clubId={10} />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('아직 공지·일정이 없어요')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /바로가기/ })).toHaveAttribute('href', '/clubs/10');
  });
});
