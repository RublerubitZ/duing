import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockPathname = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSelectedLayoutSegment: () => null,
  useParams: () => ({ clubId: '38', noticeId: '7' }),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}));

import Loading from '@/app/clubs/loading';

describe('app/clubs/loading.tsx — /clubs 세그먼트 로딩 경계(하위 상세·멤버 대기 포함)', () => {
  it('탐색 전체 스켈레톤을 지연 래퍼 안에 그린다', () => {
    mockPathname.mockReturnValue('/clubs');
    render(<Loading />);

    const skeleton = screen.getByRole('status', { name: '동아리 목록 불러오는 중' });
    expect(skeleton.parentElement).toHaveClass('delayed-show');
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다.
    expect(skeleton).not.toHaveClass('delayed-show');
  });

  it('끝 슬래시 탐색 주소(/clubs/)로 가는 대기 중에도 탐색 스켈레톤을 그린다', () => {
    mockPathname.mockReturnValue('/clubs/');
    render(<Loading />);

    expect(screen.getByRole('status', { name: '동아리 목록 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '페이지 불러오는 중' })).toBeNull();
  });

  it('상세 경로로 가는 대기 중이면 동아리 상세 스켈레톤을 그린다', () => {
    mockPathname.mockReturnValue('/clubs/38');
    render(<Loading />);

    expect(screen.getByRole('status', { name: '동아리 정보 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '동아리 목록 불러오는 중' })).toBeNull();
  });

  it('멤버 경로로 가는 대기 중이면 공용 스피너를 그린다', () => {
    mockPathname.mockReturnValue('/clubs/38/member/notices');
    render(<Loading />);

    expect(screen.getByRole('status', { name: '페이지 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '동아리 목록 불러오는 중' })).toBeNull();
    expect(screen.queryByRole('status', { name: '동아리 정보 불러오는 중' })).toBeNull();
  });
});
