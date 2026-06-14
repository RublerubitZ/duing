import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockUsePathname = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

import { BottomNav } from '../../app/_components/BottomNav';

describe('BottomNav', () => {
  it('공개 탭 영역(/clubs)에서 4탭이 노출되고 탐색이 활성이다', () => {
    mockUsePathname.mockReturnValue('/clubs');
    render(<BottomNav />);

    expect(screen.getByRole('navigation', { name: '주요 메뉴' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(4);
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '홈' })).not.toHaveAttribute('aria-current');
  });

  it('홈(/)에서는 홈 탭이 정확히 활성이다', () => {
    mockUsePathname.mockReturnValue('/');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '탐색' })).not.toHaveAttribute('aria-current');
  });

  it('상세/하위 경로(/clubs/123)도 탐색이 활성이다', () => {
    mockUsePathname.mockReturnValue('/clubs/123');
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: '탐색' })).toHaveAttribute('aria-current', 'page');
  });

  it('개인영역(/me)에서는 렌더링하지 않는다', () => {
    mockUsePathname.mockReturnValue('/me');
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it('비-탭 공개 경로(/introduce)에서도 미노출이다', () => {
    mockUsePathname.mockReturnValue('/introduce');
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });

  it('유사 접두 경로(/notifications)를 공지로 오매칭하지 않는다', () => {
    mockUsePathname.mockReturnValue('/notifications');
    const { container } = render(<BottomNav />);
    expect(container.firstChild).toBeNull();
  });
});
