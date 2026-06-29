import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} />,
}));

import { HeroActivityToast, HeroRightVisual } from '../../app/_components/sections/HomeHero';
import { resolveHeroToasts } from '../../app/_components/sections/hero-activity';

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
