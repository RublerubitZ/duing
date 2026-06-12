import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { RecruitmentSummary } from '@duing/types';

vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/app/_lib/route', () => ({ toRoute: (path: string) => path }));

const mockUseActiveRecruitments = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => {
  const actualHooks = await importOriginal<typeof import('@duing/hooks')>();
  return { ...actualHooks, useActiveRecruitments: (clubId: number) => mockUseActiveRecruitments(clubId) };
});

import { ActiveRecruitmentsCard } from '@/app/manage/_components/dashboard/ActiveRecruitmentsCard';

// 테스트가 시간이 지나도 썩지 않도록 KST 기준 오늘+N일 날짜를 동적으로 만든다.
const KST_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
function kstDatePlusDays(daysFromToday: number): string {
  return KST_DATE_FORMATTER.format(new Date(Date.now() + daysFromToday * 86_400_000));
}

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
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
    ...over,
  };
}

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
    mockUseActiveRecruitments.mockReturnValue({ data: [recruitment()], isLoading: false, isError: false });
    render(<ActiveRecruitmentsCard clubId={1} />);
    expect(screen.getByText('2026 봄 모집')).toBeInTheDocument();
    expect(screen.getByText('모집중')).toBeInTheDocument();
  });

  it('마감이 임박 윈도 안(D-2)이면 coral pill 강조 D-day 뱃지를 렌더한다', () => {
    mockUseActiveRecruitments.mockReturnValue({
      data: [recruitment({ endDate: kstDatePlusDays(2) })],
      isLoading: false,
      isError: false,
    });
    render(<ActiveRecruitmentsCard clubId={1} />);
    const badge = screen.getByText('D-2');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('pill-coral');
  });

  it('마감 당일이면 D-day로 coral pill 강조한다', () => {
    mockUseActiveRecruitments.mockReturnValue({
      data: [recruitment({ endDate: kstDatePlusDays(0) })],
      isLoading: false,
      isError: false,
    });
    render(<ActiveRecruitmentsCard clubId={1} />);
    const badge = screen.getByText('D-day');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('pill-coral');
  });

  it('마감이 멀면 muted 텍스트 D-{n}을 렌더한다', () => {
    mockUseActiveRecruitments.mockReturnValue({
      data: [recruitment({ endDate: kstDatePlusDays(30) })],
      isLoading: false,
      isError: false,
    });
    render(<ActiveRecruitmentsCard clubId={1} />);
    const badge = screen.getByText('D-30');
    expect(badge).toBeInTheDocument();
    expect(badge.className).not.toContain('pill-coral');
    expect(badge.className).toContain('text-charcoal-3');
  });

  it('ALWAYS_OPEN(상시모집)은 D-day를 렌더하지 않는다', () => {
    mockUseActiveRecruitments.mockReturnValue({
      data: [recruitment({ displayStatus: 'ALWAYS_OPEN', endDate: kstDatePlusDays(2) })],
      isLoading: false,
      isError: false,
    });
    render(<ActiveRecruitmentsCard clubId={1} />);
    expect(screen.getByText('상시모집')).toBeInTheDocument();
    expect(screen.queryByText(/^D-/)).toBeNull();
  });
});
