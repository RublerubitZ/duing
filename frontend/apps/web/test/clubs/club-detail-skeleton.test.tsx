import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const routerMock = { push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => routerMock }));
// 스켈레톤은 실제 상단 바(ClubDetailTopBar)를 그린다 — 찜 버튼이 useSeededAuthStatus 로 스토어를 직접 구독하므로(useSyncExternalStore)
// 셀렉터 호출만 흉내 내면 subscribe/getState 가 없어 렌더가 터진다(club-detail-top-bar.test 과 같은 mock).
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
// TanStack 내부는 건드리지 않고 찜 훅만 부분 mock(레포 관례) — 나머지 export 는 그대로.
vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useFavoriteIdsQuery: () => ({ data: [] }),
  useFavoriteToggleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ClubDetailSkeleton } from '@/app/clubs/[clubId]/_components/ClubDetailSkeleton';

// style 을 읽으려면 HTMLElement 여야 하므로 instanceof 로 좁힌다(as 금지).
function requireElement(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`요소가 없다: ${selector}`);
  return element;
}

describe('ClubDetailSkeleton — 상세 히어로 모양(iOS 깜빡임 P0 §6.1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    routerMock.push.mockReset();
    routerMock.back.mockReset();
  });

  it('데스크탑 블록(hidden md:block)의 로고 자리(140)에 club-logo-<id> 이름을 붙이고 지연 없이 즉시 그린다 — 목록 로고가 모핑으로 착지할 대상', () => {
    const { container } = render(<ClubDetailSkeleton clubId={38} />);

    // 데스크탑·모바일 블록은 CSS 로만 갈려 jsdom 에는 둘 다 있다 — 블록으로 좁혀 고른다.
    const desktopLogoBox = requireElement(container, 'div.md\\:block div.h-\\[140px\\]');
    expect(desktopLogoBox.style.getPropertyValue('view-transition-name')).toBe('club-logo-38');
    expect(desktopLogoBox.closest('.delayed-show')).toBeNull();
    expect(desktopLogoBox).toHaveClass('bg-graysoft');
  });

  it('모바일 블록(md:hidden)에는 로고 자리(view-transition-name 요소)가 없다 — 배너 유무로 로고 위치가 56/126px 로 갈려 착지 뒤 튐이 생기므로(스펙 §6.1)', () => {
    const { container } = render(<ClubDetailSkeleton clubId={38} />);

    const mobileBlock = requireElement(container, 'div.md\\:hidden');
    const namedElements = Array.from(mobileBlock.querySelectorAll('*')).filter(
      (element) => element instanceof HTMLElement && element.style.getPropertyValue('view-transition-name') !== '',
    );
    expect(namedElements).toHaveLength(0);
    expect(mobileBlock.querySelector('div.h-20')).toBeNull();
    // 상단 바는 모바일 블록 안에 있다(실제 히어로와 같은 자리).
    expect(mobileBlock.querySelector('button[aria-label="뒤로"]')).not.toBeNull();
  });

  it('상단 바(뒤로·찜·공유)는 지연 없이 즉시 보이고, 텍스트 줄만 지연 표시한다(지연은 래퍼·펄스는 안쪽)', () => {
    render(<ClubDetailSkeleton clubId={38} />);

    const backButton = screen.getByRole('button', { name: '뒤로' });
    expect(backButton.closest('.delayed-show')).toBeNull();
    expect(screen.getByRole('button', { name: '찜 추가' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공유' })).toBeInTheDocument();

    const textLines = screen.getByRole('status', { name: '동아리 정보 불러오는 중' });
    expect(textLines.parentElement).toHaveClass('delayed-show');
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다(#1463).
    expect(textLines).not.toHaveClass('delayed-show');
    expect(textLines).toHaveClass('animate-pulse');
  });

  it('뒤로는 이력이 있으면 back(), 새 탭처럼 이력이 없으면 /clubs 로 간다 — ClubDetailTopBar 의 동작 그대로', () => {
    const historyLength = vi.spyOn(History.prototype, 'length', 'get').mockReturnValue(2);
    render(<ClubDetailSkeleton clubId={38} />);

    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(routerMock.back).toHaveBeenCalledTimes(1);
    expect(routerMock.push).not.toHaveBeenCalled();

    historyLength.mockReturnValue(1);
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(routerMock.push).toHaveBeenCalledWith('/clubs');
    expect(routerMock.back).toHaveBeenCalledTimes(1);
  });
});
