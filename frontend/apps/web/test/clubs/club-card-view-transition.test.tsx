import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Club } from '../../app/clubs/_lib/clubs';
import { ClubCard } from '../../app/clubs/_components/ClubCard';

// next-view-transitions 의 Link 는 test/setup.ts 에서 전역 모킹된다(→ anchor).
const club: Club = {
  id: 7,
  name: '두잉',
  tagline: '매주 함께 성장하는 동아리',
  cat: '학술',
  scope: '중앙',
  division: null,
  department: null,
  color: '#1F4A36',
  logoUrl: null,
  activeRecruitment: null,
};

describe('ClubCard — 공유요소 전환(view-transition-name)', () => {
  it('로고 박스에 club-logo-<id> 이름이 부여된다 (상세 히어로와 모핑 매칭)', () => {
    render(<ClubCard club={club} />);
    const logoBox = screen.getByLabelText('두잉 로고');
    expect(logoBox.style.getPropertyValue('view-transition-name')).toBe('club-logo-7');
  });
});
