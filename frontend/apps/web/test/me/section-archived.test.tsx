import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary } from '@duing/types';

import { SectionArchived } from '../../app/me/_components/SectionArchived';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const make = (overrides: Partial<ApplicationSummary> = {}): ApplicationSummary => ({
  id: 1,
  recruitmentId: 100,
  recruitmentTitle: '봄 신입 모집',
  clubId: 10,
  clubName: '두잉 댄스',
  category: 'CULTURE',
  logoUrl: null,
  status: 'ACCEPTED',
  interview: null,
  submittedAt: '2026-04-15T10:00:00Z',
  ...overrides,
});

describe('SectionArchived', () => {
  it('ACCEPTED 카드는 "🎉 합격" pill 과 /me/applications/{id} 링크를 노출한다', () => {
    render(<SectionArchived applications={[make({ id: 5, status: 'ACCEPTED', clubName: '합격동' })]} />);
    expect(screen.getByText(/🎉\s*합격/)).toBeInTheDocument();
    expect(screen.getByText('합격동')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /합격동/ });
    expect(link).toHaveAttribute('href', '/me/applications/5');
  });

  it('REJECTED 카드는 "📝 불합격" pill 과 상세 링크를 노출한다', () => {
    render(<SectionArchived applications={[make({ id: 7, status: 'REJECTED', clubName: '불합격동' })]} />);
    expect(screen.getByText(/📝\s*불합격/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /불합격동/ });
    expect(link).toHaveAttribute('href', '/me/applications/7');
  });

  it('빈 배열이면 안내 문구와 동아리 탐색 링크가 노출된다', () => {
    render(<SectionArchived applications={[]} />);
    expect(screen.getByText(/지난 지원 내역이 없어요/)).toBeInTheDocument();
    const exploreLink = screen.getByRole('link', { name: /동아리 탐색하러 가기/ });
    expect(exploreLink).toHaveAttribute('href', '/clubs');
  });

  it('카운트 헤더에 총 개수가 반영된다', () => {
    render(
      <SectionArchived
        applications={[
          make({ id: 1, status: 'ACCEPTED' }),
          make({ id: 2, status: 'REJECTED' }),
          make({ id: 3, status: 'ACCEPTED' }),
        ]}
      />,
    );
    expect(screen.getByText(/지난 지원 · 3/)).toBeInTheDocument();
  });
});
