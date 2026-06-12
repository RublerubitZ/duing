import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActionItem } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

const mockUse = vi.fn();
vi.mock('@duing/hooks', () => ({ useClubActionItems: (clubId: number) => mockUse(clubId) }));

import { ActionItemsCard } from '@/app/manage/_components/dashboard/ActionItemsCard';

describe('ActionItemsCard', () => {
  it('총 건수 배지와 상위 미리보기를 렌더한다', () => {
    const items: ActionItem[] = [
      { type: 'INTERVIEW_ROUND_UNCONFIRMED', recruitmentId: 1, recruitmentTitle: '봄 모집', roundId: 7, roundTitle: '1차' },
      { type: 'APPLICANTS_AWAITING_REVIEW', recruitmentId: 1, recruitmentTitle: '봄 모집', count: 5 },
    ];
    mockUse.mockReturnValue({ items, preview: items, totalCount: 2, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('처리 필요 업무')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('면접 일정 미확정')).toBeInTheDocument();
    expect(screen.getByText('검토 대기 지원자')).toBeInTheDocument();
  });

  it('업무가 없으면 Empty State', () => {
    mockUse.mockReturnValue({ items: [], preview: [], totalCount: 0, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('처리할 업무가 없어요')).toBeInTheDocument();
  });
});
