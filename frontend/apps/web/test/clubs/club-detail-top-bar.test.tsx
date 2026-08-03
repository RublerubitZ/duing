import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClubDetailTopBar } from '../../app/clubs/[clubId]/_components/ClubDetailTopBar';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
// 찜 버튼은 useSeededAuthStatus 로 스토어를 직접 구독한다(useSyncExternalStore) — 셀렉터 호출만
// 흉내 내면 subscribe/getState 가 없어 렌더가 터진다.
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
vi.mock('@duing/hooks', () => ({
  useFavoriteIdsQuery: () => ({ data: [] }),
  useFavoriteToggleMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('ClubDetailTopBar — 모바일 상단 액션바', () => {
  it('뒤로 · 찜 · 공유 버튼을 노출한다', () => {
    render(<ClubDetailTopBar clubId={1} />);
    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '찜 추가' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '공유' })).toBeInTheDocument();
  });
});
