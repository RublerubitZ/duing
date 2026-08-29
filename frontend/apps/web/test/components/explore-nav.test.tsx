import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));
vi.mock('@/components/duing/BrandMark', () => ({ BrandMark: () => <span>두잉</span> }));
vi.mock('../../app/_components/NotificationBell', () => ({ NotificationBell: () => <button>알림</button> }));
vi.mock('../../app/_components/HomeNavAuthSlot', () => ({ HomeNavAuthSlot: () => <span>인증</span> }));

import { ExploreNav } from '../../app/_components/ExploreNav';

beforeEach(() => {
  window.localStorage.clear();
});

describe('ExploreNav — 동아리·공지 상세 모바일 숨김', () => {
  it('동아리 목록(/clubs)에서는 브랜드 바가 모바일에서도 노출(hidden 아님)', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav slimOnMobile />);
    expect(screen.getByRole('banner')).not.toHaveClass('hidden');
  });

  it('동아리 상세(/clubs/123)에서는 모바일에서 브랜드 바를 숨긴다(hidden md:block)', () => {
    mockUsePathname.mockReturnValue('/clubs/123');
    render(<ExploreNav slimOnMobile />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveClass('hidden');
    expect(banner).toHaveClass('md:block');
  });

  it('상세 하위 경로(/clubs/123/sub)는 숨기지 않는다', () => {
    mockUsePathname.mockReturnValue('/clubs/123/sub');
    render(<ExploreNav slimOnMobile />);
    expect(screen.getByRole('banner')).not.toHaveClass('hidden');
  });

  it('공지 상세(/notices/123)에서도 모바일에서 브랜드 바를 숨긴다', () => {
    mockUsePathname.mockReturnValue('/notices/123');
    render(<ExploreNav slimOnMobile />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveClass('hidden');
    expect(banner).toHaveClass('md:block');
  });
});

describe('ExploreNav — 정보 메뉴', () => {
  it('메뉴 라벨은 공지가 아니라 소식이다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '소식' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '공지' })).not.toBeInTheDocument();
  });

  it.each(['/notices', '/faq', '/terms', '/introduce', '/notices/123'])(
    '%s 에서 정보 메뉴가 활성이다',
    (path) => {
      mockUsePathname.mockReturnValue(path);
      render(<ExploreNav />);
      expect(screen.getByRole('link', { name: '소식' })).toHaveClass('text-ink-deep');
    },
  );

  it('정보 섹션 밖(/clubs)에서는 정보 메뉴가 비활성이다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '소식' })).not.toHaveClass('text-ink-deep');
  });

  it('정보 메뉴는 마지막 방문 허브 경로로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/faq');
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '소식' })).toHaveAttribute('href', '/faq');
  });

  it('방문 이력이 없으면 정보 메뉴는 /notices 로 이동한다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '소식' })).toHaveAttribute('href', '/notices');
  });

  it('허브 페이지에서는 정보 메뉴가 직전 허브가 아니라 현재 페이지로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/terms');
    mockUsePathname.mockReturnValue('/faq');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '소식' })).toHaveAttribute('href', '/faq');
  });

  it('활성 메뉴에 aria-current="page" 를 표시한다', () => {
    mockUsePathname.mockReturnValue('/faq');
    render(<ExploreNav />);
    expect(screen.getByRole('link', { name: '소식' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '탐색' })).not.toHaveAttribute('aria-current');
  });
});
