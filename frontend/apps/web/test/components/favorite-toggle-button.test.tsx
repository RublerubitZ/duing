import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 찜 하트 프레스 — 찜이 "켜지는" 순간에만 팝이 재생된다.
 * 공용 플로우(useFavoriteToggleFlow)는 레포 관례대로 부분이 아닌 전체 mock:
 * 여기서 보는 건 하트의 표현(클래스·리마운트)이지 토글 동작 계약이 아니다.
 */
const { favoriteState } = vi.hoisted(() => ({
  favoriteState: { ids: new Set<number>(), directionUnknown: false },
}));

vi.mock('@/app/_lib/useFavoriteToggleFlow', () => ({
  useFavoriteToggleFlow: () => ({
    isFavorited: (clubId: number) => favoriteState.ids.has(clubId),
    toggle: (clubId: number) => {
      if (favoriteState.ids.has(clubId)) favoriteState.ids.delete(clubId);
      else favoriteState.ids.add(clubId);
    },
    isPending: false,
    isDirectionUnknown: favoriteState.directionUnknown,
  }),
}));

import { FavoriteToggleButton } from '@/app/_components/FavoriteToggleButton';

function heartOf(button: HTMLElement) {
  return button.querySelector('svg');
}

describe('FavoriteToggleButton — 하트 프레스', () => {
  beforeEach(() => {
    favoriteState.ids.clear();
    favoriteState.directionUnknown = false;
  });

  it('이미 찜한 채로 마운트되면 팝하지 않는다 — 아무도 누르지 않았는데 튀지 않도록', () => {
    favoriteState.ids.add(7);
    render(<FavoriteToggleButton clubId={7} />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(heartOf(button)?.getAttribute('class')).not.toContain('animate-heart-pop');
  });

  it('마운트 후 해제했다가 다시 찜하면 팝한다', async () => {
    favoriteState.ids.add(7);
    const { rerender } = render(<FavoriteToggleButton clubId={7} />);

    await userEvent.click(screen.getByRole('button'));
    rerender(<FavoriteToggleButton clubId={7} />);
    expect(heartOf(screen.getByRole('button'))?.getAttribute('class')).not.toContain('animate-heart-pop');

    await userEvent.click(screen.getByRole('button'));
    rerender(<FavoriteToggleButton clubId={7} />);
    expect(heartOf(screen.getByRole('button'))?.getAttribute('class')).toContain('animate-heart-pop');
  });

  it('찜 목록이 늦게 도착해 찜한 상태가 드러나도 팝하지 않는다 (준비 전 반영)', async () => {
    // 방향 미확정 구간에는 찜한 동아리도 "찜 안 함"으로 보인다 — 목록이 도착하며 켜지는 전환은
    // 사용자가 누른 게 아니므로 재생하지 않는다.
    favoriteState.directionUnknown = true;
    const { rerender } = render(<FavoriteToggleButton clubId={7} />);
    expect(heartOf(screen.getByRole('button'))?.getAttribute('class')).not.toContain('animate-heart-pop');

    favoriteState.directionUnknown = false;
    favoriteState.ids.add(7);
    rerender(<FavoriteToggleButton clubId={7} />);
    const readyButton = screen.getByRole('button');
    expect(readyButton).toHaveAttribute('aria-pressed', 'true');
    expect(heartOf(readyButton)?.getAttribute('class')).not.toContain('animate-heart-pop');

    // 그 뒤 사용자가 직접 해제했다가 다시 찜하면 정상적으로 팝한다.
    await userEvent.click(readyButton);
    rerender(<FavoriteToggleButton clubId={7} />);
    await userEvent.click(screen.getByRole('button'));
    rerender(<FavoriteToggleButton clubId={7} />);
    expect(heartOf(screen.getByRole('button'))?.getAttribute('class')).toContain('animate-heart-pop');
  });

  it('찜하지 않은 상태의 하트에는 팝 클래스가 없다', () => {
    render(<FavoriteToggleButton clubId={7} />);
    expect(heartOf(screen.getByRole('button'))?.getAttribute('class')).not.toContain('animate-heart-pop');
  });

  it('찜을 켜면 하트에 animate-heart-pop 이 붙고, 해제하면 다시 사라진다', async () => {
    const { rerender } = render(<FavoriteToggleButton clubId={7} />);

    await userEvent.click(screen.getByRole('button'));
    rerender(<FavoriteToggleButton clubId={7} />);
    const onButton = screen.getByRole('button');
    expect(onButton).toHaveAttribute('aria-pressed', 'true');
    expect(heartOf(onButton)?.getAttribute('class')).toContain('animate-heart-pop');

    await userEvent.click(onButton);
    rerender(<FavoriteToggleButton clubId={7} />);
    const offButton = screen.getByRole('button');
    expect(offButton).toHaveAttribute('aria-pressed', 'false');
    expect(heartOf(offButton)?.getAttribute('class')).not.toContain('animate-heart-pop');
  });
});
