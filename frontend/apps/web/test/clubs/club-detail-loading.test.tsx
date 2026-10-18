import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockPathname = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSelectedLayoutSegment: () => null,
  useParams: () => ({ clubId: '38', noticeId: '7' }),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}));
// 상세 스켈레톤은 실제 상단 바(ClubDetailTopBar)를 그린다 — 찜 버튼이 스토어·찜 쿼리를 부르므로 상단 바 테스트와 같은 mock 을 둔다.
vi.mock('@duing/stores', () => {
  const state = { status: 'unauthenticated' };
  return {
    useAuthStore: Object.assign((selector: (s: typeof state) => unknown) => selector(state), {
      subscribe: () => () => {},
      getState: () => state,
      getInitialState: () => state,
    }),
  };
});
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useFavoriteIdsQuery: () => ({ data: [] }),
  useFavoriteToggleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import Loading from '@/app/clubs/[clubId]/loading';

describe('app/clubs/[clubId]/loading.tsx — 동아리 상세 경로 로딩 경계', () => {
  it('스피너 대신 화면 안 로딩과 같은 스켈레톤을 지연 래퍼 안에 그린다', () => {
    mockPathname.mockReturnValue('/clubs/38');
    render(<Loading />);

    const skeleton = screen.getByRole('status', { name: '동아리 정보 불러오는 중' });
    expect(skeleton.parentElement).toHaveClass('delayed-show');
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다.
    expect(skeleton).not.toHaveClass('delayed-show');
    expect(screen.queryByRole('status', { name: '페이지 불러오는 중' })).toBeNull();
  });

  it('멤버 경로로 가는 대기 중이면 동아리 상세 스켈레톤 대신 공용 스피너를 그린다', () => {
    mockPathname.mockReturnValue('/clubs/38/member');
    render(<Loading />);

    expect(screen.getByRole('status', { name: '페이지 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '동아리 정보 불러오는 중' })).toBeNull();
  });
});
