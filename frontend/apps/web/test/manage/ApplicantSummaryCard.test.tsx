import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ApplicantStatusTotals } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockUseApplicantSummary = vi.fn();
vi.mock('@duing/hooks', () => ({ useApplicantSummary: (clubId: number) => mockUseApplicantSummary(clubId) }) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { ApplicantSummaryCard } from '@/app/manage/_components/dashboard/ApplicantSummaryCard';

const emptyTotals: ApplicantStatusTotals = {
  total: 0,
  submitted: 0,
  onHold: 0,
  interviewPending: 0,
  accepted: 0,
  rejected: 0,
  capacity: 0,
};

describe('ApplicantSummaryCard', () => {
  it('지원자 데이터가 없으면 빈 상태를 표시한다', () => {
    mockUseApplicantSummary.mockReturnValue({ totals: emptyTotals, isLoading: false, isError: false });
    render(<ApplicantSummaryCard clubId={1} />);
    expect(screen.getByText('집계할 지원자 데이터가 없어요')).toBeInTheDocument();
  });

  it('지원자 데이터가 있으면 5개 라벨과 수치를 표시한다', () => {
    const totals: ApplicantStatusTotals = {
      total: 20,
      submitted: 5,
      onHold: 6,
      interviewPending: 4,
      accepted: 3,
      rejected: 2,
      capacity: 20,
    };
    mockUseApplicantSummary.mockReturnValue({ totals, isLoading: false, isError: false });
    render(<ApplicantSummaryCard clubId={1} />);
    expect(screen.getByText('접수')).toBeInTheDocument();
    expect(screen.getByText('보류')).toBeInTheDocument();
    expect(screen.getByText('면접대기')).toBeInTheDocument();
    expect(screen.getByText('합격')).toBeInTheDocument();
    expect(screen.getByText('불합격')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });
});
