import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

// 홈 링크 프리페치 제외(P0 Active CPU 조치) — 홈이 ISR(#925)로 바뀐 뒤에도 복원은 실측 후
// 별도 판단이므로 유지한다.
// 전역 네비 3종(BottomNav·ExploreNav·HomeNav)의 홈 링크는 prefetch={false} 여야 하고,
// 나머지 링크는 기본 프리페치 정책(undefined)을 유지해야 한다 — 둘 다 가드한다.
// next/link 는 prefetch 여부를 DOM 에 남기지 않으므로 스텁으로 받아 data 속성으로 노출한다.
type LinkStubProps = Omit<ComponentPropsWithoutRef<'a'>, 'href'> & {
  href: string;
  prefetch?: boolean;
  children: ReactNode;
};

vi.mock('next/link', () => ({
  default: ({ href, prefetch, children, ...anchorProps }: LinkStubProps) => (
    <a {...anchorProps} href={href} data-prefetch={String(prefetch)}>
      {children}
    </a>
  ),
}));

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));

vi.mock('../../app/_components/BrandMark', () => ({ BrandMark: () => <span>두잉</span> }));
vi.mock('@/components/duing/BrandMark', () => ({ BrandMark: () => <span>두잉</span> }));
vi.mock('../../app/_components/NotificationBell', () => ({ NotificationBell: () => <button>알림</button> }));
vi.mock('../../app/_components/HomeNavAuthSlot', () => ({ HomeNavAuthSlot: () => <span>인증</span> }));
vi.mock('../../app/_components/HomeNavAdminLink', () => ({ HomeNavAdminLink: () => <span>관리</span> }));
vi.mock('../../app/_components/InfoNavLink', () => ({ InfoNavLink: () => <span>정보</span> }));

import { BottomNav } from '../../app/_components/BottomNav';
import { ExploreNav } from '../../app/_components/ExploreNav';
import { HomeNav } from '../../app/_components/HomeNav';

beforeEach(() => {
  window.localStorage.clear();
});

function expectPrefetch(link: HTMLElement, value: 'false' | 'undefined') {
  expect(link).toHaveAttribute('data-prefetch', value);
}

describe('전역 네비 홈 링크 프리페치 가드', () => {
  it('BottomNav — 홈 탭만 prefetch=false, 나머지 4탭은 기본 정책 유지', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);

    expectPrefetch(screen.getByRole('link', { name: '홈' }), 'false');
    for (const label of ['탐색', '시설', '일정', '소식']) {
      expectPrefetch(screen.getByRole('link', { name: label }), 'undefined');
    }
  });

  it('ExploreNav — 브랜드·홈 링크만 prefetch=false, 나머지는 기본 정책 유지', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);

    expectPrefetch(screen.getByRole('link', { name: '두잉 홈' }), 'false');
    expectPrefetch(screen.getByRole('link', { name: '홈' }), 'false');
    for (const label of ['탐색', '시설', '일정', '소식']) {
      expectPrefetch(screen.getByRole('link', { name: label }), 'undefined');
    }
  });

  it('HomeNav — 브랜드·홈 링크만 prefetch=false, 나머지는 기본 정책 유지', () => {
    render(<HomeNav />);

    expectPrefetch(screen.getByRole('link', { name: '두잉 홈' }), 'false');
    expectPrefetch(screen.getByRole('link', { name: '홈' }), 'false');
    for (const label of ['탐색', '시설', '일정']) {
      expectPrefetch(screen.getByRole('link', { name: label }), 'undefined');
    }
  });
});
