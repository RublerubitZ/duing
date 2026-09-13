import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MyPageTabs } from '../../app/me/_components/MyPageTabs';

const sections = [
  { id: 'apply', label: '지원 현황', count: 2 },
  { id: 'joined', label: '내 동아리', count: 1 },
];

function tab(label: string) {
  return screen.getByRole('button', { name: new RegExp(label) });
}

describe('MyPageTabs — 활성 탭 언더라인', () => {
  // border-none 은 border-style:none 이라 border-b-[2.5px] 의 사용값을 0 으로 눌러
  // 활성 탭 밑줄이 아예 그려지지 않았다(색만 지정되고 두께 0).
  it('활성 탭은 border-ink 밑줄을 그리고 border-none 으로 두께를 지우지 않는다', () => {
    render(<MyPageTabs sections={sections} active="apply" onSelect={vi.fn()} />);

    const active = tab('지원 현황');
    expect(active.className).not.toContain('border-none');
    expect(active.className).toContain('border-b-[2.5px]');
    expect(active.className).toContain('border-solid');
    expect(active.className).toContain('border-ink');
  });

  it('비활성 탭은 같은 두께의 투명 밑줄로 자리만 잡는다(활성 전환 시 밀림 없음)', () => {
    render(<MyPageTabs sections={sections} active="apply" onSelect={vi.fn()} />);

    const inactive = tab('내 동아리');
    expect(inactive.className).not.toContain('border-none');
    expect(inactive.className).toContain('border-b-[2.5px]');
    expect(inactive.className).toContain('border-transparent');
    expect(inactive.className).not.toContain('border-ink');
  });

  it('카운트 뱃지와 알림 점은 그대로 유지한다', () => {
    render(
      <MyPageTabs
        sections={[...sections, { id: 'saved', label: '찜', badge: true }]}
        active="apply"
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(tab('찜').querySelector('.bg-coral')).not.toBeNull();
  });
});
