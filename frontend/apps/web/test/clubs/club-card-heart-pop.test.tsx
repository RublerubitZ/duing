import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Club } from '../../app/clubs/_lib/clubs';
import { ClubCard } from '../../app/clubs/_components/ClubCard';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const baseClub: Club = {
  id: 1,
  name: '테스트 동아리',
  tagline: '매주 함께 성장하는 동아리',
  cat: '학술',
  scope: '중앙',
  division: '컴퓨터정보공학분과',
  department: null,
  college: null,
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

// 찜 하트 프레스 — 꺼진 하트를 본 뒤 켜질 때만 팝한다(모바일 ClubListItem 과 같은 규칙).
function heartClass() {
  return screen.getByRole('button', { name: /찜/ }).querySelector('svg')?.getAttribute('class') ?? '';
}

describe('ClubCard — 찜 하트 팝', () => {
  it('이미 찜한 채로 마운트되면 팝하지 않고, 해제 후 다시 찜할 때만 팝한다', () => {
    const { rerender } = render(<ClubCard club={baseClub} liked />);
    expect(heartClass()).not.toContain('animate-heart-pop');

    rerender(<ClubCard club={baseClub} liked={false} />);
    expect(heartClass()).not.toContain('animate-heart-pop');

    rerender(<ClubCard club={baseClub} liked />);
    expect(heartClass()).toContain('animate-heart-pop');
  });

  it('찜 목록 도착 전(isFavoriteStateReady=false) 반영은 팝하지 않고, 그 뒤 토글에만 팝한다', () => {
    const { rerender } = render(
      <ClubCard club={baseClub} liked={false} isFavoriteStateReady={false} />,
    );
    expect(heartClass()).not.toContain('animate-heart-pop');

    // 목록이 도착하며 "사실은 찜한 동아리"로 드러나는 전환 — 사용자가 누른 게 아니라 팝하지 않는다.
    rerender(<ClubCard club={baseClub} liked isFavoriteStateReady />);
    expect(heartClass()).not.toContain('animate-heart-pop');

    rerender(<ClubCard club={baseClub} liked={false} isFavoriteStateReady />);
    rerender(<ClubCard club={baseClub} liked isFavoriteStateReady />);
    expect(heartClass()).toContain('animate-heart-pop');
  });

  it('꺼진 하트로 시작해 찜하면 팝하고, 다시 해제하면 팝 클래스가 사라진다', () => {
    const { rerender } = render(<ClubCard club={baseClub} liked={false} />);
    expect(heartClass()).not.toContain('animate-heart-pop');

    rerender(<ClubCard club={baseClub} liked />);
    expect(heartClass()).toContain('animate-heart-pop');

    rerender(<ClubCard club={baseClub} liked={false} />);
    expect(heartClass()).not.toContain('animate-heart-pop');
  });
});
