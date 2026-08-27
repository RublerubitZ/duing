import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// aria-label 등 나머지 속성도 실제 Link 처럼 앵커로 전달한다(접근명 검증에 필요).
vi.mock('next/link', () => ({
  default: ({ href, children, ...anchorProps }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...anchorProps}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

const mockFetchClubStats = vi.fn<() => Promise<{ totalCount: number; recruitingCount: number } | null>>();
const mockFetchPublicActivities = vi.fn<() => Promise<HeroActivity[]>>();

vi.mock('../../app/_lib/club-stats', () => ({
  fetchClubStats: () => mockFetchClubStats(),
}));

vi.mock('../../app/_lib/public-activities', () => ({
  fetchPublicActivities: () => mockFetchPublicActivities(),
}));

import { HeroActivityToast, HeroRightVisual, HomeHero } from '../../app/_components/sections/HomeHero';
import { resolveHeroToasts, type HeroActivity } from '../../app/_components/sections/hero-activity';

const NOW = new Date('2026-06-28T12:00:00.000Z');
const fallbackToasts = resolveHeroToasts([], NOW);

describe('HeroRightVisual', () => {
  it('목업 카드 카피(트레몰로/두잉코드/면접 확정!)를 렌더하지 않는다', () => {
    render(<HeroRightVisual recruitingCount={1} toasts={fallbackToasts} />);
    expect(screen.queryByText('트레몰로')).not.toBeInTheDocument();
    expect(screen.queryByText('두잉코드')).not.toBeInTheDocument();
    expect(screen.queryByText('면접 확정!')).not.toBeInTheDocument();
  });

  it('일러스트를 alt 와 함께 렌더한다', () => {
    render(<HeroRightVisual recruitingCount={1} toasts={fallbackToasts} />);
    expect(
      screen.getByRole('img', { name: '두잉 — 캠퍼스 동아리 활동 일러스트레이션' }),
    ).toBeInTheDocument();
  });

  it('recruitingCount 분기: number 는 그대로, 0 은 "0", null 은 "—"', () => {
    const { rerender } = render(<HeroRightVisual recruitingCount={5} toasts={fallbackToasts} />);
    expect(screen.getByText('5')).toBeInTheDocument();

    rerender(<HeroRightVisual recruitingCount={0} toasts={fallbackToasts} />);
    expect(screen.getByText('0')).toBeInTheDocument();

    rerender(<HeroRightVisual recruitingCount={null} toasts={fallbackToasts} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  // href 는 exploreParams 의 recruitment 필터 값과 커플링 — 'available' 이 아니면 필터가 걸리지 않는다.
  it('모집중 카드 전체가 모집중 필터 탐색 링크다', () => {
    render(<HeroRightVisual recruitingCount={16} toasts={fallbackToasts} />);
    const recruitingCard = screen.getByRole('link', { name: /이번 학기 모집중/ });
    expect(recruitingCard).toHaveAttribute('href', '/clubs?recruitment=available');
    expect(recruitingCard).toHaveTextContent('16');
  });

  it('폴백 토스트 2개(캠퍼스 동아리)와 문구를 렌더한다', () => {
    render(<HeroRightVisual recruitingCount={1} toasts={fallbackToasts} />);
    expect(screen.getAllByText('캠퍼스 동아리')).toHaveLength(2);
    expect(screen.getByText('신규 모집 오픈')).toBeInTheDocument();
    expect(screen.getByText('합격자 발표')).toBeInTheDocument();
  });

  it('실활동 토스트는 동아리명·발생문구를 렌더한다(폴백 대체)', () => {
    const toasts = resolveHeroToasts(
      [
        { type: 'NOTICE_CREATED', clubName: '두잉코딩', occurredAt: '2026-06-28T11:30:00.000Z' },
        { type: 'INTERVIEW_RESULT', clubName: '캠퍼스밴드', occurredAt: '2026-06-28T09:00:00.000Z' },
      ],
      NOW,
    );
    render(<HeroRightVisual recruitingCount={1} toasts={toasts} />);
    expect(screen.getByText('두잉코딩')).toBeInTheDocument();
    expect(screen.getByText('새 공지 등록')).toBeInTheDocument();
    expect(screen.getByText('캠퍼스밴드')).toBeInTheDocument();
    expect(screen.getByText('합격자 발표')).toBeInTheDocument();
    expect(screen.queryByText('캠퍼스 동아리')).not.toBeInTheDocument();
  });
});

describe('HomeHero (server component)', () => {
  it('모집중 카드는 데스크탑 1개만 링크로 남고, 활동 토스트도 데스크탑 2개만 남는다', async () => {
    mockFetchClubStats.mockResolvedValueOnce({ totalCount: 40, recruitingCount: 16 });
    mockFetchPublicActivities.mockResolvedValueOnce([]);

    render(<>{await HomeHero()}</>);

    // 모바일 히어로는 시안대로 마스코트만 두고 모집중 카드를 뺐다 — 링크는 데스크탑 카드 하나뿐이다.
    const recruitingLinks = screen.getAllByRole('link', { name: /이번 학기 모집중/ });
    expect(recruitingLinks).toHaveLength(1);
    for (const link of recruitingLinks) {
      expect(link).toHaveAttribute('href', '/clubs?recruitment=available');
    }
    // 모바일 스택에서 토스트를 제거했으므로 폴백 토스트는 HeroRightVisual 의 2개뿐이다(이전 4개).
    expect(screen.getAllByText('캠퍼스 동아리')).toHaveLength(2);
  });

  it('통계 조회 실패 시 링크 접근명이 "—" 대신 안내 문구가 된다', async () => {
    mockFetchClubStats.mockResolvedValueOnce(null);
    mockFetchPublicActivities.mockResolvedValueOnce([]);

    render(<>{await HomeHero()}</>);

    expect(
      screen.getAllByRole('link', { name: '모집 현황 정보 없음 — 이번 학기 모집중 동아리 보기' }),
    ).toHaveLength(1);
  });
});

describe('HeroActivityToast', () => {
  it('variant=dark 는 bg-ink-deep, light 는 bg-paper 클래스를 갖는다', () => {
    const { container, rerender } = render(
      <HeroActivityToast variant="dark" clubName="A" message="m" timeAgo="방금 전" />,
    );
    expect(container.firstChild).toHaveClass('bg-ink-deep');

    rerender(<HeroActivityToast variant="light" clubName="A" message="m" timeAgo="방금 전" />);
    expect(container.firstChild).toHaveClass('bg-paper');
  });
});
