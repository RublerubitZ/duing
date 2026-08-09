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
  tagline: '매주 함께 성장하는 동아리',
  cat: '학술',
  scope: '중앙',
  division: null,
  department: null,
  college: null,
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

/* ── 테스트 ─────────────────────────────────────────────────── */
describe('ClubCard — 소속 칩·분과·해시태그 렌더링', () => {
  it('scope="중앙", division=null → "중앙" 칩만, 분과 텍스트 없음', () => {
    render(<ClubCard club={{ ...baseClub, scope: '중앙', division: null }} />);
    expect(screen.getByText('중앙')).toBeInTheDocument();
    expect(screen.queryByText(/분과/)).toBeNull();
  });

  it('scope="중앙", division="컴퓨터정보공학부" → "중앙" 칩 + "컴퓨터정보공학부분과" 회색 텍스트 분리', () => {
    render(<ClubCard club={{ ...baseClub, scope: '중앙', division: '컴퓨터정보공학부' }} />);
    expect(screen.getByText('중앙')).toBeInTheDocument();
    expect(screen.getByText('컴퓨터정보공학부분과')).toBeInTheDocument();
  });

  it('division 이 이미 "…분과"로 끝나면 접미를 중복 부착하지 않는다', () => {
    render(<ClubCard club={{ ...baseClub, scope: '중앙', division: '전시창작분과' }} />);
    expect(screen.getByText('전시창작분과')).toBeInTheDocument();
    expect(screen.queryByText('전시창작분과분과')).toBeNull();
  });

  it('scope="학과" → "단과대" 칩을 그리고 division 이 있어도 분과 텍스트는 내보내지 않는다', () => {
    render(<ClubCard club={{ ...baseClub, scope: '학과', division: '컴퓨터정보공학부' }} />);
    expect(screen.getByText('단과대')).toBeInTheDocument();
    expect(screen.queryByText('학과')).toBeNull();
    expect(screen.queryByText(/분과/)).toBeNull();
  });

  it('단과대 동아리는 분과 자리에 학과를 중앙동아리와 같은 위치·스타일로 표시한다', () => {
    render(<ClubCard club={{ ...baseClub, scope: '학과', department: '회계학과' }} />);
    expect(screen.getByText('단과대')).toBeInTheDocument();
    expect(screen.getByText('회계학과')).toBeInTheDocument();
  });

  it('학과가 없으면 단과대학명으로 물러선다 — 특정 학과가 아닌 단과대 산하 동아리를 위해', () => {
    render(
      <ClubCard club={{ ...baseClub, scope: '학과', department: null, college: 'GLOBAL_BUSINESS' }} />,
    );
    expect(screen.getByText('단과대')).toBeInTheDocument();
    expect(screen.getByText('글로벌경영대학')).toBeInTheDocument();
  });

  it('학과가 있으면 단과대학명 대신 학과명을 쓴다', () => {
    render(
      <ClubCard
        club={{ ...baseClub, scope: '학과', department: '회계학과', college: 'GLOBAL_BUSINESS' }}
      />,
    );
    expect(screen.getByText('회계학과')).toBeInTheDocument();
    expect(screen.queryByText('글로벌경영대학')).toBeNull();
  });

  it('학과·단과대학이 모두 없으면 소속 영역 자체를 렌더하지 않는다', () => {
    render(<ClubCard club={{ ...baseClub, scope: '학과', department: null, college: null }} />);
    expect(screen.getByText('단과대')).toBeInTheDocument();
    expect(screen.queryByText('-')).toBeNull();
    expect(screen.queryByText('없음')).toBeNull();
  });

  it('중앙동아리는 학과 값이 남아 있어도 분과만 표시한다', () => {
    render(<ClubCard club={{ ...baseClub, scope: '중앙', division: '학술', department: '회계학과' }} />);
    expect(screen.getByText('학술분과')).toBeInTheDocument();
    expect(screen.queryByText('회계학과')).toBeNull();
  });

  it('한줄 소개(tagline)를 이름 아래에 렌더한다', () => {
    render(<ClubCard club={baseClub} />);
    expect(screen.getByText('매주 함께 성장하는 동아리')).toBeInTheDocument();
  });

  it('tagline 미작성(null)이면 플레이스홀더 없이 NBSP 빈 줄로 높이만 유지한다', () => {
    render(<ClubCard club={{ ...baseClub, tagline: null }} />);
    expect(screen.queryByText('소개 준비중')).toBeNull();
    expect(screen.queryByText('매주 함께 성장하는 동아리')).toBeNull();
    // 빈 줄(NBSP)이 렌더되어 카테고리 행 위치가 다른 카드와 동일하게 유지된다
    expect(screen.getByText(' ', { normalizer: (text) => text })).toBeInTheDocument();
  });
});
