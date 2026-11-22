import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FavoriteClub } from '@duing/types';

import { SectionSaved } from '../../app/me/_components/SectionSaved';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const make = (overrides: Partial<FavoriteClub> = {}): FavoriteClub => ({
  clubId: 1,
  name: '두잉 밴드',
  logoUrl: null,
  category: 'ART',
  division: '공연예술',
  favoritedAt: '2026-05-17T01:23:45',
  openRecruitmentCount: 0,
  ...overrides,
});

describe('SectionSaved — 긴 이름·분과는 카드 안에서 줄바꿈', () => {
  it('이름과 분과를 감싼 블록이 긴 낱말을 줄바꿈한다', () => {
    render(<SectionSaved favorites={[make()]} totalCount={1} />);
    const name = screen.getByText('두잉 밴드');
    const division = screen.getByText('공연예술분과');
    const block = name.parentElement;

    expect(block).not.toBeNull();
    expect(division.parentElement).toBe(block);
    expect(block).toHaveClass('break-words');
  });
});

// 마이페이지는 찜 첫 페이지(20개)만 받는다 — 숫자는 받은 길이가 아니라 전체 수다(#1580).
describe('SectionSaved — 전체 수와 전체 보기', () => {
  it('제목은 받은 카드 수가 아니라 전체 수다', () => {
    render(<SectionSaved favorites={[make()]} totalCount={25} />);

    expect(screen.getByRole('heading', { level: 2, name: '찜한 동아리 · 25' })).toBeInTheDocument();
  });

  it('전체가 받은 것보다 많으면 /me/favorites 로 가는 전체 보기를 둔다', () => {
    render(<SectionSaved favorites={[make()]} totalCount={25} />);

    expect(screen.getByRole('link', { name: '찜한 동아리 전체 보기' })).toHaveAttribute('href', '/me/favorites');
  });

  // 회귀 가드 — 받은 것이 전부면 같은 목록으로 가는 링크는 필요 없다.
  it('받은 것이 전부면 전체 보기를 두지 않는다', () => {
    render(<SectionSaved favorites={[make()]} totalCount={1} />);

    expect(screen.queryByRole('link', { name: '찜한 동아리 전체 보기' })).not.toBeInTheDocument();
  });

  // 빈 판정은 전체 수로 — 제목 숫자('· 3')와 빈 안내가 어긋나지 않게(SectionInquiries 와 같은 기준).
  it('받은 카드가 없어도 전체 수가 있으면 빈 안내를 그리지 않는다', () => {
    render(<SectionSaved favorites={[]} totalCount={3} />);

    expect(screen.queryByText(/아직 찜한 동아리가 없어요/)).not.toBeInTheDocument();
  });
});
