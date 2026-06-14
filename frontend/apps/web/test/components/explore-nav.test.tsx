import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('../../app/_components/BrandMark', () => ({ BrandMark: () => <span>두잉</span> }));
vi.mock('../../app/_components/NotificationBell', () => ({ NotificationBell: () => <button>알림</button> }));
vi.mock('../../app/_components/HomeNavAuthSlot', () => ({ HomeNavAuthSlot: () => <span>인증</span> }));

import { ExploreNav } from '../../app/_components/ExploreNav';

describe('ExploreNav — 동아리 상세 모바일 숨김', () => {
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
    render(<ExploreNav active="공지" slimOnMobile />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveClass('hidden');
    expect(banner).toHaveClass('md:block');
  });
});
