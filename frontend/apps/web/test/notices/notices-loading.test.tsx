import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockPathname = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useParams: () => ({ clubId: '38', noticeId: '7' }),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}));

vi.mock('../../app/_components/InfoTabs', () => ({
  InfoTabs: () => <nav aria-label="정보" />,
}));

import Loading from '@/app/notices/loading';

describe('app/notices/loading.tsx — 소식 목록 경로 로딩 경계', () => {
  it('정보 탭 줄은 바로 그리고, 목록 자리는 지연 래퍼 안의 화면 모양 스켈레톤으로 그린다', () => {
    mockPathname.mockReturnValue('/notices');
    render(<Loading />);

    expect(screen.getByRole('navigation', { name: '정보' }).closest('.delayed-show')).toBeNull();
    const skeleton = screen.getByRole('status', { name: '공지 목록 불러오는 중' });
    expect(skeleton.closest('.delayed-show')).not.toBeNull();
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다.
    expect(skeleton).not.toHaveClass('delayed-show');
    expect(skeleton).toHaveClass('animate-pulse');
    expect(screen.queryByRole('status', { name: '페이지 불러오는 중' })).toBeNull();
  });

  it('상세 경로로 가는 대기 중이면 소식 상세 스켈레톤을 그리고 정보 탭은 그리지 않는다', () => {
    mockPathname.mockReturnValue('/notices/7');
    render(<Loading />);

    expect(screen.getByRole('status', { name: '공지 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '공지 목록 불러오는 중' })).toBeNull();
    // 상세는 정보 탭 미노출 정책이다.
    expect(screen.queryByRole('navigation', { name: '정보' })).toBeNull();
  });
});
