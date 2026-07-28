import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { BottomNav } from '../../app/_components/BottomNav';

describe('BottomNav', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('공개 탭 영역(/clubs)에서 5탭(홈·탐색·시설·캘린더·정보)이 노출되고 탐색이 활성이다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);

    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(5);
    expect(screen.getByRole('link', { name: '정보' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '공지' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
  });

  it('시설 목록(/facilities)에서는 시설 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/facilities');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '시설' })).toHaveAttribute('aria-current', 'page');
  });

  it('시설 상세(/facilities/12)는 유틸리티 뷰라 탭바를 유지하고 시설 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/facilities/12');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '시설' })).toHaveAttribute('aria-current', 'page');
  });

  it('홈(/)에서는 홈 탭이 정확히 활성이다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '탐색' })).not.toHaveAttribute('aria-current');
  });

  it('동아리 상세(/clubs/123)는 자체 하단 지원 바를 쓰므로 탭바를 미노출한다', () => {
    mockUsePathname.mockReturnValue('/clubs/123');
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it('상세 단독 경로만 숨기고 하위 경로(/clubs/123/sub)는 탐색이 활성이다', () => {
    mockUsePathname.mockReturnValue('/clubs/123/sub');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('aria-current', 'page');
  });

  it('공지 상세(/notices/123)도 자체 상단 액션바를 쓰므로 탭바를 미노출한다', () => {
    mockUsePathname.mockReturnValue('/notices/123');
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it('공지 목록(/notices)에서는 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/notices');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });

  it('개인영역(/me)에서는 렌더링하지 않는다', () => {
    mockUsePathname.mockReturnValue('/me');
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it('서비스 소개(/introduce)는 정보 섹션이라 탭바가 노출되고 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/introduce');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });

  it('자주 묻는 질문(/faq)은 정보 섹션이라 탭바가 노출되고 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/faq');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });

  it('유사 접두 경로(/notifications)를 공지로 오매칭하지 않는다', () => {
    mockUsePathname.mockReturnValue('/notifications');
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it('운영정책(/terms)도 정보 섹션이라 탭바가 노출되고 정보 탭이 활성이다', () => {
    mockUsePathname.mockReturnValue('/terms');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('aria-current', 'page');
  });

  it('정보 탭은 마지막 방문 허브 경로로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/terms');
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/terms');
  });

  it('방문 이력이 없으면 정보 탭은 /notices 로 이동한다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/notices');
  });

  it('허브 페이지에서 정보 탭은 직전 허브가 아니라 현재 페이지로 이동한다', () => {
    window.localStorage.setItem('duing:info-last-path', '/terms');
    mockUsePathname.mockReturnValue('/faq');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '정보' })).toHaveAttribute('href', '/faq');
  });

  // 같은 탭이 활성/비활성에서 서로 다른 아이콘(아웃라인 ↔ 채움)을 그려야 한다.
  // 한쪽 변형만 쓰도록 되돌리면 두 마크업이 같아져 실패한다.
  it('활성 탭은 채움 아이콘을, 비활성 탭은 아웃라인 아이콘을 그린다', () => {
    const homeIconMarkup = () =>
      screen.getByRole('link', { name: '홈' }).querySelector('svg')?.innerHTML;

    mockUsePathname.mockReturnValue('/clubs');
    const { unmount } = render(<BottomNav />);
    const outlineHome = homeIconMarkup();
    unmount();

    mockUsePathname.mockReturnValue('/');
    render(<BottomNav />);
    const filledHome = homeIconMarkup();

    expect(outlineHome).toBeTruthy();
    expect(filledHome).toBeTruthy();
    expect(filledHome).not.toBe(outlineHome);
  });
});
