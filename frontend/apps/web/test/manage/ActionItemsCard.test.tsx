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

  it('면접 라운드 생성 필요 항목은 라벨과 면접 라운드 화면 딥링크를 렌더한다', () => {
    const items: ActionItem[] = [
      { type: 'INTERVIEW_ROUND_NEEDED', recruitmentId: 1, recruitmentTitle: '봄 모집', count: 2 },
    ];
    mockUse.mockReturnValue({ items, preview: items, totalCount: 1, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    const label = screen.getByText('면접 라운드 생성 필요');
    expect(label).toBeInTheDocument();
    const link = label.closest('a');
    expect(link).toHaveAttribute('href', '/manage/clubs/10/recruitments/1/interview');
  });

  it('면접 결과 미확정이 라운드에 귀속되면 해당 라운드 딥링크를 렌더한다', () => {
    const items: ActionItem[] = [
      { type: 'INTERVIEW_RESULT_PENDING', recruitmentId: 1, recruitmentTitle: '봄 모집', roundId: 7, roundTitle: '1차', count: 3 },
    ];
    mockUse.mockReturnValue({ items, preview: items, totalCount: 1, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    const link = screen.getByText('면접 결과 미확정').closest('a');
    expect(link).toHaveAttribute('href', '/manage/clubs/10/recruitments/1/interview/rounds/7');
  });

  it('면접 결과 미확정이 라운드 귀속 없으면 면접 랜딩 딥링크를 렌더한다', () => {
    const items: ActionItem[] = [
      { type: 'INTERVIEW_RESULT_PENDING', recruitmentId: 1, recruitmentTitle: '봄 모집', count: 3 },
    ];
    mockUse.mockReturnValue({ items, preview: items, totalCount: 1, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    const link = screen.getByText('면접 결과 미확정').closest('a');
    expect(link).toHaveAttribute('href', '/manage/clubs/10/recruitments/1/interview');
  });

  it('업무가 없으면 Empty State', () => {
    mockUse.mockReturnValue({ items: [], preview: [], totalCount: 0, isLoading: false, isError: false });
    render(<ActionItemsCard clubId={10} />);
    expect(screen.getByText('처리할 업무가 없어요')).toBeInTheDocument();
  });
});
