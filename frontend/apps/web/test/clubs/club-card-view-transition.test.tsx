import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Club } from '../../app/clubs/_lib/clubs';
import { ClubCard } from '../../app/clubs/_components/ClubCard';
import { ClubListItem } from '../../app/clubs/_components/ClubListItem';

// next-view-transitions 의 Link 는 test/setup.ts 에서 전역 모킹된다(→ anchor).
const club: Club = {
  id: 7,
  name: '두잉',
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

describe('ClubCard — 공유요소 전환(view-transition-name)', () => {
  it('로고 박스에 club-logo-<id> 이름이 부여된다 (상세 히어로와 모핑 매칭)', () => {
    render(<ClubCard club={club} />);
    const logoBox = screen.getByLabelText('두잉 로고');
    expect(logoBox.style.getPropertyValue('view-transition-name')).toBe('club-logo-7');
  });
});

// 모바일 목록 행(ClubListItem)은 모바일에서만 그려진다 — 모바일 전환은 화면 전체 push 라 로고에 공유요소 이름을 달지 않는다
// (이름이 있으면 화면이 통째로 밀리는 동안 로고만 따로 날아간다, globals.css).
describe('ClubListItem — 모바일 목록 로고(공유요소 이름 없음)', () => {
  it('로고 박스에 view-transition-name 이 없다', () => {
    render(<ClubListItem club={club} />);
    const logoBox = screen.getByLabelText('두잉 로고');
    expect(logoBox.style.getPropertyValue('view-transition-name')).toBe('');
  });
});
