import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockUseActiveRecruitments = vi.fn();
vi.mock('@duing/hooks', () => ({ useActiveRecruitments: (clubId: number) => mockUseActiveRecruitments(clubId) }));

import { ActiveRecruitmentsCard } from '@/app/manage/_components/dashboard/ActiveRecruitmentsCard';

describe('ActiveRecruitmentsCard', () => {
  it('로딩 상태를 표시한다', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<ActiveRecruitmentsCard clubId={1} />);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
  });

  it('데이터가 없으면 빈 상태를 표시한다', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<ActiveRecruitmentsCard clubId={1} />);
    expect(screen.getByText('진행 중인 모집이 없어요')).toBeInTheDocument();
  });

  it('OPEN 모집이 있으면 제목과 모집중 pill을 표시한다', () => {
    const recruitment: RecruitmentSummary = {
      id: 42,
      clubId: 1,
      clubName: '두잉',
      title: '2026 봄 모집',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      capacity: 10,
      status: 'OPEN',
      displayStatus: 'OPEN',
      effectivelyOpen: true,
      applicationMode: 'SELF',
      externalFormUrl: null,
      useInterview: true,
      targetRole: 'MEMBER',
    };
    mockUseActiveRecruitments.mockReturnValue({ data: [recruitment], isLoading: false, isError: false });
    render(<ActiveRecruitmentsCard clubId={1} />);
    expect(screen.getByText('2026 봄 모집')).toBeInTheDocument();
    expect(screen.getByText('모집중')).toBeInTheDocument();
  });
});
