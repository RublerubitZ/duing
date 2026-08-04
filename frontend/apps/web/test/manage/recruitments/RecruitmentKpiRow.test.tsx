import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RecruitmentSummary, StatsSummary } from '@duing/types';

const mockSummary = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actualHooks = await importOriginal<typeof import('@duing/hooks')>();
  return {
    ...actualHooks,
    useRecruitmentStatsSummaryQuery: (recruitmentId: number | undefined) => mockSummary(recruitmentId),
  };
});

import { RecruitmentKpiRow } from '@/app/manage/clubs/[clubId]/recruitments/_components/RecruitmentKpiRow';

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 1,
    clubId: 1,
    clubName: '두잉',
    title: '10기 모집',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    capacity: 20,
    status: 'OPEN',
    displayStatus: 'OPEN',
    effectivelyOpen: true,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: true,
    targetRole: 'MEMBER',
    ...over,
  };
}

function statsSummary(over: Partial<StatsSummary> = {}): StatsSummary {
  return {
    total: 0,
    submitted: 0,
    onHold: 0,
    interviewPending: 0,
    accepted: 0,
    rejected: 0,
    capacity: 20,
    ratio: 0,
    ...over,
  };
}

describe('RecruitmentKpiRow', () => {
  it('4개 타일에 summary 버킷 값을 표시하고 검토 대기는 submitted+onHold 합이다', () => {
    mockSummary.mockReturnValue({
      data: statsSummary({ total: 34, submitted: 5, onHold: 7, interviewPending: 8, accepted: 2 }),
      isLoading: false,
    });
    render(<RecruitmentKpiRow recruitment={recruitment()} />);

    expect(screen.getByText('지원자')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('정원 20명')).toBeInTheDocument();
    expect(screen.getByText('검토 대기')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('면접 대기')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('합격')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('면접을 진행하지 않는 모집은 데이터가 있어도 면접 대기를 —로 표시한다', () => {
    mockSummary.mockReturnValue({
      data: statsSummary({ total: 5, submitted: 0, onHold: 1, interviewPending: 8, accepted: 0 }),
      isLoading: false,
    });
    render(<RecruitmentKpiRow recruitment={recruitment({ useInterview: false })} />);

    expect(screen.queryByText('8')).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('summary 로딩 중이면 4개 값 모두 —로 표시한다 (정원 부제는 유지)', () => {
    mockSummary.mockReturnValue({ data: undefined, isLoading: true });
    render(<RecruitmentKpiRow recruitment={recruitment()} />);

    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.getByText('정원 20명')).toBeInTheDocument();
  });
});
