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

import { HeroRightVisual, HomeHero } from '../../app/_components/sections/HomeHero';
import {
  HeroActivityToast,
  HeroActivityToasts,
} from '../../app/_components/sections/HeroActivityToasts';
import { resolveHeroToasts, type HeroActivity } from '../../app/_components/sections/hero-activity';

const NOW = new Date('2026-06-28T12:00:00.000Z');
const fallbackToasts = resolveHeroToasts([], NOW);

describe('HeroRightVisual', () => {
  it('목업 카드 카피(트레몰로/두잉코드/면접 확정!)를 렌더하지 않는다', () => {
    render(<HeroRightVisual toasts={fallbackToasts} />);
    expect(screen.queryByText('트레몰로')).not.toBeInTheDocument();
    expect(screen.queryByText('두잉코드')).not.toBeInTheDocument();
    expect(screen.queryByText('면접 확정!')).not.toBeInTheDocument();
  });

  it('일러스트를 alt 와 함께 렌더한다', () => {
    render(<HeroRightVisual toasts={fallbackToasts} />);
    expect(
      screen.getByRole('img', { name: '두잉 — 캠퍼스 동아리 활동 일러스트레이션' }),
    ).toBeInTheDocument();
  });

  it('시안대로 모집중 카드를 두지 않는다', () => {
    render(<HeroRightVisual toasts={fallbackToasts} />);
    expect(screen.queryByText(/이번 학기 모집중/)).not.toBeInTheDocument();
  });

  it('활동이 없으면 폴백 토스트 한 장만 렌더한다', () => {
    render(<HeroRightVisual toasts={fallbackToasts} />);
    expect(screen.getAllByText('캠퍼스 동아리')).toHaveLength(1);
    expect(screen.getByText('신규 모집 오픈')).toBeInTheDocument();
  });

  it('실활동 토스트는 동아리명·발생문구를 렌더한다(폴백 대체)', () => {
    const toasts = resolveHeroToasts(
      [
        { type: 'NOTICE_CREATED', clubName: '두잉코딩', occurredAt: '2026-06-28T11:30:00.000Z' },
        { type: 'INTERVIEW_RESULT', clubName: '캠퍼스밴드', occurredAt: '2026-06-28T09:00:00.000Z' },
      ],
      NOW,
    );
    render(<HeroRightVisual toasts={toasts} />);
    expect(screen.getByText('두잉코딩')).toBeInTheDocument();
    expect(screen.getByText('새 공지 등록')).toBeInTheDocument();
    expect(screen.getByText('캠퍼스밴드')).toBeInTheDocument();
    expect(screen.getByText('합격자 발표')).toBeInTheDocument();
    expect(screen.queryByText('캠퍼스 동아리')).not.toBeInTheDocument();
  });
});

describe('HomeHero (server component)', () => {
  it('시안대로 모집중 카드는 PC·모바일 어디에도 없다', async () => {
    mockFetchClubStats.mockResolvedValueOnce({ totalCount: 40, recruitingCount: 16 });
    mockFetchPublicActivities.mockResolvedValueOnce([]);

    render(<>{await HomeHero()}</>);

    expect(screen.queryByText(/이번 학기 모집중/)).not.toBeInTheDocument();
    // 활동 토스트는 우측 비주얼의 캐러셀 한 자리뿐이다.
    expect(screen.getAllByText('캠퍼스 동아리')).toHaveLength(1);
  });

  it('통계 조회에 실패해도 히어로가 렌더된다(문구만 숫자 없는 기본형으로 내려간다)', async () => {
    mockFetchClubStats.mockResolvedValueOnce(null);
    mockFetchPublicActivities.mockResolvedValueOnce([]);

    render(<>{await HomeHero()}</>);

    expect(screen.getByText(/캠퍼스의 모든 동아리가 지금도/)).toBeInTheDocument();
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

describe('HeroActivityToasts (스와이프 캐러셀)', () => {
  function toastAt(index: number) {
    return { variant: 'light' as const, clubName: `동아리${index}`, message: '신규 모집 오픈', timeAgo: '방금 전' };
  }

  it('토스트가 하나면 페이저를 만들지 않는다', () => {
    render(<HeroActivityToasts toasts={[toastAt(0)]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('토스트가 여럿이면 개수만큼 페이저 버튼을 만들고 첫 번째가 현재로 표시된다', () => {
    render(<HeroActivityToasts toasts={[toastAt(0), toastAt(1), toastAt(2)]} />);

    const dots = screen.getAllByRole('button');
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    expect(dots[1]).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: '2번째 활동 보기' })).toBeInTheDocument();
  });

  it('슬라이드를 가로 스크롤 스냅 컨테이너에 담아 옆으로 밀 수 있게 한다', () => {
    render(<HeroActivityToasts toasts={[toastAt(0), toastAt(1)]} />);

    // 포인터 드래그를 직접 구현하지 않고 네이티브 스크롤 스냅에 맡긴다는 계약.
    const scroller = screen.getByRole('group', { name: '최근 동아리 활동' });
    expect(scroller).toHaveClass('overflow-x-auto', 'snap-x', 'snap-mandatory');
    expect(screen.getAllByText('신규 모집 오픈')).toHaveLength(2);
  });

  it('그림자가 잘리지 않도록 스크롤 컨테이너에 여백을 두고 같은 크기로 되돌린다', () => {
    render(<HeroActivityToasts toasts={[toastAt(0), toastAt(1)]} />);

    // 가로 스크롤 컨테이너는 세로도 함께 자른다 — 여유가 없으면 카드 그림자가 라운드 경계에서
    // 직각으로 잘려 사각 테두리처럼 보인다. 음수 마진이 빠지면 토스트 위치가 24px 밀린다.
    const scroller = screen.getByRole('group', { name: '최근 동아리 활동' });
    expect(scroller).toHaveClass('py-6', '-my-6');
  });
});
