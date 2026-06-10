import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApplicationSummary } from '@duing/types';

import { SectionApply } from '../../app/me/_components/SectionApply';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const base: ApplicationSummary = {
  id: 1,
  recruitmentId: 100,
  recruitmentTitle: '봄 신입 모집',
  clubId: 10,
  clubName: '두잉 댄스',
  category: 'CULTURE',
  logoUrl: null,
  status: 'SUBMITTED',
  interview: null,
  submittedAt: '2026-05-26T10:00:00Z',
};

describe('SectionApply — active 상태만 렌더', () => {
  it('SUBMITTED 카드는 정상 렌더된다', () => {
    render(<SectionApply applications={[base]} />);
    expect(screen.getByText('두잉 댄스')).toBeInTheDocument();
  });

  it('ACCEPTED 가 섞여 들어와도 카드가 렌더되지 않는다', () => {
    const accepted = { ...base, id: 2, status: 'ACCEPTED' as const, clubName: '합격동아리' };
    render(<SectionApply applications={[base, accepted]} />);
    expect(screen.getByText('두잉 댄스')).toBeInTheDocument();
    expect(screen.queryByText('합격동아리')).not.toBeInTheDocument();
  });

  it('빈 배열이면 안내 문구가 노출된다', () => {
    render(<SectionApply applications={[]} />);
    expect(screen.getByText(/진행 중인 지원이 없어요/)).toBeInTheDocument();
  });
});
