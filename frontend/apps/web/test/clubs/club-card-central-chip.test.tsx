import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Club } from '../../app/clubs/_lib/clubs';
import { ClubCard } from '../../app/clubs/_components/ClubCard';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
const baseClub: Club = {
  id: 1,
  name: '테스트 동아리',
  tag: '소개',
  cat: '학술',
  scope: '중앙',
  division: null,
  status: 'open',
  gen: '15기',
  spots: '5명',
  deadline: '~6/30',
  color: '#1F4A36',
  logoUrl: null,
};

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('ClubCard — scope/division chip 렌더링', () => {
  it('scope="중앙", division=null → "🏛️ 중앙" 보임, "·" 없음', () => {
    render(<ClubCard club={{ ...baseClub, scope: '중앙', division: null }} />);
    const chip = screen.getByText('🏛️ 중앙');
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).not.toContain('·');
  });

  it('scope="중앙", division="컴퓨터정보공학부" → "🏛️ 중앙 · 컴퓨터정보공학부"', () => {
    render(<ClubCard club={{ ...baseClub, scope: '중앙', division: '컴퓨터정보공학부' }} />);
    expect(screen.getByText('🏛️ 중앙 · 컴퓨터정보공학부')).toBeInTheDocument();
  });

  it('scope="학과", division="컴퓨터정보공학부" → "🎓 학과 · 컴퓨터정보공학부"', () => {
    render(<ClubCard club={{ ...baseClub, scope: '학과', division: '컴퓨터정보공학부' }} />);
    expect(screen.getByText('🎓 학과 · 컴퓨터정보공학부')).toBeInTheDocument();
  });

  it('scope="학과", division=null → "🎓 학과" 만', () => {
    render(<ClubCard club={{ ...baseClub, scope: '학과', division: null }} />);
    const chip = screen.getByText('🎓 학과');
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).not.toContain('·');
  });
});
