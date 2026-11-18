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
    render(<SectionSaved favorites={[make()]} />);
    const name = screen.getByText('두잉 밴드');
    const division = screen.getByText('공연예술분과');
    const block = name.parentElement!;

    expect(division.parentElement).toBe(block);
    expect(block).toHaveClass('break-words');
  });
});
