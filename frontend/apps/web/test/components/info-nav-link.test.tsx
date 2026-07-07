import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { InfoNavLink } from '../../app/_components/InfoNavLink';

beforeEach(() => {
  window.localStorage.clear();
});

describe('InfoNavLink — HomeNav 용 정보 링크 슬롯', () => {
  it('방문 이력이 없으면 /notices 로 이동한다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/notices');
  });

  it('마지막 방문 허브 경로로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/introduce');
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/introduce');
  });

  it('className 을 링크에 전달한다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<InfoNavLink className="text-charcoal-3" />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveClass('text-charcoal-3');
  });
});
