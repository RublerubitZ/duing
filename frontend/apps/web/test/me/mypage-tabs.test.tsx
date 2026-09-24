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

describe('MyPageTabs — 모바일 1줄(짧은 라벨·인라인 카운트), PC 는 원래 라벨·배지', () => {
  const withShort = [
    { id: 'joined', label: '가입한 동아리', shortLabel: '가입', count: 2 },
    { id: 'archived', label: '지난 지원', shortLabel: '지난 지원', count: 1 },
  ];

  it('탭 행은 모바일에서 줄바꿈하지 않고 PC 에서만 wrap 한다', () => {
    const { container } = render(
      <MyPageTabs sections={withShort} active="joined" onSelect={vi.fn()} />,
    );
    const row = container.querySelector('[data-mypage-tabs] > div')!;
    expect(row.className).not.toMatch(/(^|\s)flex-wrap(\s|$)/);
    expect(row.className).toContain('sm:flex-wrap');
  });

  it('짧은 라벨은 모바일 전용, 원래 라벨은 PC 전용으로 나란히 둔다', () => {
    render(<MyPageTabs sections={withShort} active="joined" onSelect={vi.fn()} />);
    const short = screen.getByText('가입');
    const full = screen.getByText('가입한 동아리');
    expect(short.className).toContain('sm:hidden');
    expect(full.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(full.className).toContain('sm:inline');
  });

  it('shortLabel 이 없으면 라벨 하나만 그린다', () => {
    render(<MyPageTabs sections={sections} active="apply" onSelect={vi.fn()} />);
    expect(screen.getAllByText('지원 현황')).toHaveLength(1);
  });

  it('카운트는 모바일 인라인 텍스트, PC 에서만 pill(배경·둥근 모서리)', () => {
    render(<MyPageTabs sections={withShort} active="joined" onSelect={vi.fn()} />);
    const activeCount = screen.getByText('2');
    const inactiveCount = screen.getByText('1');
    // 기본(모바일)엔 pill 클래스가 없고 sm: 접두로만 붙는다.
    expect(activeCount.className).not.toMatch(/(^|\s)(rounded-full|bg-ink|px-2)(\s|$)/);
    expect(activeCount.className).toContain('sm:rounded-full');
    expect(activeCount.className).toContain('sm:bg-ink');
    expect(activeCount.className).toContain('sm:text-paper');
    expect(inactiveCount.className).toContain('sm:bg-graysoft');
  });
});
