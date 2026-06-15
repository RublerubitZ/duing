import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClubDetailTopBar } from '../../app/clubs/[clubId]/_components/ClubDetailTopBar';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }));
vi.mock('@duing/stores', () => ({
  useAuthStore: (selector: (state: { status: string }) => unknown) =>
    selector({ status: 'unauthenticated' }),
}));
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
