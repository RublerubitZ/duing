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

import Loading from '@/app/clubs/loading';

function requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`요소가 없다: ${selector}`);
  return element;
}

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

  it('상세 경로 대기 화면은 상단 바(뒤로)와 도착 경로 id 의 데스크탑 로고 자리(club-logo-38)를 지연 없이 그린다', () => {
    mockPathname.mockReturnValue('/clubs/38');
    const { container } = render(<Loading />);

    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
    const desktopLogoBox = requireElement(container, 'div.md\\:block div.h-\\[140px\\]');
    expect(desktopLogoBox.style.getPropertyValue('view-transition-name')).toBe('club-logo-38');
    expect(desktopLogoBox.closest('.delayed-show')).toBeNull();
  });

  it('숫자가 아닌 상세 경로(/clubs/abc)로 가는 대기는 상세 스켈레톤이 아니라 공용 스피너다 — 탐색 내비와 같은 \\d+ 규칙', () => {
    mockPathname.mockReturnValue('/clubs/abc');
    render(<Loading />);

    expect(screen.getByRole('status', { name: '페이지 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '동아리 정보 불러오는 중' })).toBeNull();
    expect(screen.queryByRole('button', { name: '뒤로' })).toBeNull();
  });

  it('멤버 경로로 가는 대기 중이면 공용 스피너를 그린다', () => {
    mockPathname.mockReturnValue('/clubs/38/member/notices');
    render(<Loading />);

    expect(screen.getByRole('status', { name: '페이지 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: '동아리 목록 불러오는 중' })).toBeNull();
    expect(screen.queryByRole('status', { name: '동아리 정보 불러오는 중' })).toBeNull();
  });
});
