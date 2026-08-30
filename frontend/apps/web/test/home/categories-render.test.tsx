import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ClubStats } from '@duing/types';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    'aria-label'?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { fetchClubStatsMock } = vi.hoisted(() => ({ fetchClubStatsMock: vi.fn() }));
vi.mock('@/app/_lib/club-stats', () => ({ fetchClubStats: fetchClubStatsMock }));

import { Categories } from '@/app/_components/sections/Categories';
import { HOME_CATEGORIES } from '@/app/_lib/homeCategories';

const stats: ClubStats = {
  totalCount: 60,
  recruitingCount: 12,
  categoryCounts: {
    ACADEMIC: 42,
    CREATION: 20,
    ART: 4,
    SPORTS: 11,
    VOLUNTEER: 7,
    RELIGION: 1,
    HOBBY: 1,
    OTHER: 0,
  },
};

beforeEach(() => {
  fetchClubStatsMock.mockReset();
  fetchClubStatsMock.mockResolvedValue(stats);
});

describe('Categories', () => {
  it('8개 카테고리 라벨이 모두 렌더된다', async () => {
    render(await Categories());

    // 모바일 타일 + 데스크탑 카드 이중 렌더 — 각 라벨이 두 번 등장한다.
    for (const label of ['학술', '창작', '예술', '운동', '봉사', '종교', '취미', '기타']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('각 카테고리 링크가 enum 값을 URL 쿼리로 사용한다', async () => {
    const { container } = render(await Categories());

    const expectedHrefs = [
      '/clubs?category=ACADEMIC',
      '/clubs?category=CREATION',
      '/clubs?category=ART',
      '/clubs?category=SPORTS',
      '/clubs?category=VOLUNTEER',
      '/clubs?category=RELIGION',
      '/clubs?category=HOBBY',
      '/clubs?category=OTHER',
    ];
    for (const href of expectedHrefs) {
      expect(container.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
  });

  it('카테고리별 동아리 수가 카드에 표시된다', async () => {
    render(await Categories());

    expect(screen.getByText('42개')).toBeInTheDocument();
    expect(screen.getByText('11개')).toBeInTheDocument();
    // 0곳인 카테고리도 빈칸이 아니라 "0개" 로 보여야 한다.
    expect(screen.getByText('0개')).toBeInTheDocument();
  });

  it('개수를 접근명에 함께 실어 스크린리더가 이름과 수를 한 번에 읽는다', async () => {
    render(await Categories());

    expect(screen.getAllByRole('link', { name: '학술 동아리 42개 보기' }).length).toBeGreaterThan(0);
  });

  it('픽토그램은 토스페이스 원본 SVG 로 렌더하고 접근성 트리에서는 감춘다', async () => {
    const { container } = render(await Categories());

    // 웹폰트로 얹으면 같은 그림에 5.9MB 를 내려받는다 — 원본 SVG 경로를 계약으로 고정한다.
    const icons = container.querySelectorAll('img[src^="/tossface/"]');
    // 모바일 타일 + 데스크탑 카드 이중 렌더라 카테고리 수의 두 배다.
    expect(icons).toHaveLength(HOME_CATEGORIES.length * 2);
    for (const icon of icons) {
      expect(icon).toHaveAttribute('alt', '');
      expect(icon).toHaveAttribute('aria-hidden');
    }
  });

  it('통계 조회에 실패하면 개수만 생략하고 카테고리 타일은 그대로 그린다', async () => {
    fetchClubStatsMock.mockResolvedValue(null);

    render(await Categories());

    expect(screen.getAllByText('학술').length).toBeGreaterThan(0);
    expect(screen.queryByText(/개$/)).toBeNull();
    expect(screen.getAllByRole('link', { name: '학술 동아리 보기' }).length).toBeGreaterThan(0);
  });
});
