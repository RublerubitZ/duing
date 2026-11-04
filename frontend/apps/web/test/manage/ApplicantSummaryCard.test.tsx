import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { ApplicantStatusTotals, RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    className,
    'aria-label': ariaLabel,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockUseApplicantSummary = vi.fn();
const mockUseActiveRecruitments = vi.fn();
vi.mock('@duing/hooks', () => ({
  useApplicantSummary: (clubId: number) => mockUseApplicantSummary(clubId),
  useActiveRecruitments: (clubId: number) => mockUseActiveRecruitments(clubId),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

import { ApplicantSummaryCard } from '@/app/manage/_components/dashboard/ApplicantSummaryCard';

const totals = (over: Partial<ApplicantStatusTotals> = {}): ApplicantStatusTotals => ({
  total: 0, submitted: 0, onHold: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 0, ...over,
});
const recruitment = (title: string): Pick<RecruitmentSummary, 'id' | 'title'> => ({ id: 1, title });

describe('ApplicantSummaryCard(지원자 현황 띠)', () => {
  it('검토 대기·면접 대상·합격·불합격 4칸과 보조 문구를 그린다', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: [recruitment('2026 2학기 신입 부원 모집')], isLoading: false, isError: false });
    mockUseApplicantSummary.mockReturnValue({
      totals: totals({ total: 27, submitted: 9, onHold: 3, interviewPending: 8, accepted: 5, rejected: 2 }),
      isLoading: false, isError: false,
    });
    render(<ApplicantSummaryCard clubId={1} />);
    // 긴 모집명만 말줄임되고 인원은 따로 남는다
    const recruitmentTitle = screen.getByText('2026 2학기 신입 부원 모집');
    expect(recruitmentTitle).toHaveClass('truncate');
    expect(recruitmentTitle).toHaveAttribute('title', '2026 2학기 신입 부원 모집');
    expect(screen.getByText(/총 27명/)).toBeInTheDocument();
    expect(screen.getByText('검토 대기')).toBeInTheDocument();
    expect(screen.getByText('12명')).toBeInTheDocument();
    expect(screen.getByText('지원 완료 9 + 보류 3')).toBeInTheDocument();
    expect(screen.getByText('면접 대상')).toBeInTheDocument();
    expect(screen.getByText('8명')).toBeInTheDocument();
    expect(screen.getByText('합격')).toBeInTheDocument();
    expect(screen.getByText('불합격')).toBeInTheDocument();
    // 옛 5칸의 단독 칸은 없다
    expect(screen.queryByText('보류')).not.toBeInTheDocument();
    expect(screen.queryByText('지원 완료')).not.toBeInTheDocument();
    const tileLinks = screen.getAllByRole('link').filter((link) => link.getAttribute('href') === '/manage/clubs/1/applicants');
    expect(tileLinks).toHaveLength(4);
    // 보조 문구가 있는 칸만 길어지지 않게 네 칸이 행 높이를 채운다
    for (const tileLink of tileLinks) expect(tileLink).toHaveClass('h-full');
    // 칸 안의 span 들이 붙어 읽히지 않게 링크 이름을 문장으로 준다
    expect(screen.getByRole('link', { name: '검토 대기 12명, 지원 완료 9 + 보류 3' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '모집별 통계 보기' })).toHaveAttribute('href', '/manage/clubs/1/recruitments');
    // 글자 높이(약 16px)만으로는 손가락으로 누르기 어렵다 — 터치 영역 44px.
    expect(screen.getByRole('link', { name: '모집별 통계 보기' })).toHaveClass('min-h-11');
  });

  it('진행 중 모집이 없으면 숫자 대신 — 와 "진행 중 모집 없음"', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: [], isLoading: false, isError: false });
    mockUseApplicantSummary.mockReturnValue({ totals: totals(), isLoading: false, isError: false });
    render(<ApplicantSummaryCard clubId={1} />);
    expect(screen.getByText('진행 중 모집 없음')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByRole('link', { name: '합격, 진행 중 모집 없음' })).toBeInTheDocument();
  });

  it('진행 중 모집이 2건 이상이면 합산 문구', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: [recruitment('A'), { id: 2, title: 'B' }], isLoading: false, isError: false });
    mockUseApplicantSummary.mockReturnValue({ totals: totals({ total: 3, submitted: 3 }), isLoading: false, isError: false });
    render(<ApplicantSummaryCard clubId={1} />);
    expect(screen.getByText('진행 중 모집 2건 합산 · 총 3명')).toBeInTheDocument();
  });

  it('조회에 실패해 0명이면 오류 안내', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockUseApplicantSummary.mockReturnValue({ totals: totals(), isLoading: false, isError: true });
    render(<ApplicantSummaryCard clubId={1} />);
    expect(screen.getByText('불러오지 못했어요. 잠시 후 다시 시도해 주세요.')).toBeInTheDocument();
  });

  it('일부만 실패하면 받은 값 + 일부 실패 안내', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: [recruitment('2026 2학기 신입 부원 모집')], isLoading: false, isError: false });
    mockUseApplicantSummary.mockReturnValue({ totals: totals({ total: 5, submitted: 5 }), isLoading: false, isError: true });
    render(<ApplicantSummaryCard clubId={1} />);
    expect(screen.getByText('5명')).toBeInTheDocument();
    expect(screen.getByText('일부 정보를 불러오지 못했어요.')).toBeInTheDocument();
  });

  it('로딩 중에는 보조 문구를 그리지 않는다("진행 중 모집 없음"이 사실처럼 보이지 않게)', () => {
    mockUseActiveRecruitments.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockUseApplicantSummary.mockReturnValue({ totals: totals(), isLoading: true, isError: false });
    render(<ApplicantSummaryCard clubId={1} />);
    expect(screen.queryByText('진행 중 모집 없음')).not.toBeInTheDocument();
  });
});
