import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn<() => string>();
vi.mock('next/navigation', () => ({ usePathname: () => mockUsePathname() }));

import { InfoTabs } from '../../app/_components/InfoTabs';

beforeEach(() => {
  window.localStorage.clear();
});

describe('InfoTabs', () => {
  it('탭 4개(공지·자주 묻는 질문·운영정책·서비스 소개)를 기존 URL 로 렌더한다', () => {
    mockUsePathname.mockReturnValue('/notices');
    render(<InfoTabs />);

    expect(screen.getByRole('navigation', { name: '정보' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: '공지' })).toHaveAttribute('href', '/notices');
    expect(screen.getByRole('link', { name: '자주 묻는 질문' })).toHaveAttribute('href', '/faq');
    expect(screen.getByRole('link', { name: '운영정책' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: '서비스 소개' })).toHaveAttribute('href', '/introduce');
  });

  it('현재 경로 탭에만 aria-current="page" 를 표시한다', () => {
    mockUsePathname.mockReturnValue('/terms');
    render(<InfoTabs />);

    expect(screen.getByRole('link', { name: '운영정책' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '공지' })).not.toHaveAttribute('aria-current');
  });

  it('허브 방문 시 마지막 방문 경로를 기록한다', () => {
    mockUsePathname.mockReturnValue('/faq');
    render(<InfoTabs />);
    expect(window.localStorage.getItem('duing:info-last-path')).toBe('/faq');
  });

  it('모바일 sticky, 데스크탑 static 이 의도된 UX — nav 에 sticky·md:static 클래스', () => {
    mockUsePathname.mockReturnValue('/notices');
    render(<InfoTabs />);
    const nav = screen.getByRole('navigation', { name: '정보' });
    expect(nav).toHaveClass('sticky');
    expect(nav).toHaveClass('md:static');
  });
});
