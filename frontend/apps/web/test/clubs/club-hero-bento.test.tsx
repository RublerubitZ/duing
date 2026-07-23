import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubHeroActivity } from '@duing/types';
import { ClubHeroBento } from '../../app/clubs/[clubId]/_components/ClubHeroBento';

const make = (id: number, order: number): ClubHeroActivity => ({
  id,
  clubPhotoId: id,
  storageKey: `k${id}.jpg`,
  caption: null,
  width: null,
  height: null,
  title: `활동${id}`,
  description: `설명${id}`,
  displayOrder: order,
});

const makeMany = (...ids: number[]): ClubHeroActivity[] => ids.map((n) => make(n, n));

describe('ClubHeroBento — 개수별 벤토(학생 래퍼)', () => {
  it('6개면 3열 그리드에 첫 카드가 2×2 큰 대표로 렌더된다', () => {
    render(<ClubHeroBento heroActivities={makeMany(1, 2, 3, 4, 5, 6)} onOpen={vi.fn()} />);
    const cells = screen.getAllByRole('button');
    expect(cells).toHaveLength(6);
    expect(cells[0]?.className).toContain('col-span-2');
    expect(cells[0]?.className).toContain('row-span-2');
    expect(cells[0]?.parentElement?.className).toContain('grid-cols-3');
  });

  it('4개면 2열 균등 그리드(큰 대표 없음)', () => {
    render(<ClubHeroBento heroActivities={makeMany(1, 2, 3, 4)} onOpen={vi.fn()} />);
    const cells = screen.getAllByRole('button');
    expect(cells).toHaveLength(4);
    expect(cells[0]?.parentElement?.className).toContain('grid-cols-2');
    cells.forEach((cell) => expect(cell.className).not.toContain('col-span-2'));
  });

  it('2개면 2열 + 최대폭 제한, 1개면 단독 + 최대폭 제한', () => {
    const { rerender } = render(
      <ClubHeroBento heroActivities={makeMany(1, 2)} onOpen={vi.fn()} />,
    );
    const twoGrid = screen.getAllByRole('button')[0]?.parentElement;
    expect(twoGrid?.className).toContain('grid-cols-2');
    expect(twoGrid?.className).toContain('max-w-[640px]');

    rerender(<ClubHeroBento heroActivities={makeMany(1)} onOpen={vi.fn()} />);
    const oneGrid = screen.getAllByRole('button')[0]?.parentElement;
    expect(oneGrid?.className).toContain('grid-cols-1');
    expect(oneGrid?.className).toContain('max-w-[320px]');
  });

  it('번호 배지를 렌더하지 않고, 카드 클릭 시 해당 인덱스로 onOpen 을 부른다', () => {
    const onOpen = vi.fn();
    render(<ClubHeroBento heroActivities={makeMany(1, 2, 3)} onOpen={onOpen} />);
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '활동3 자세히 보기' }));
    expect(onOpen).toHaveBeenCalledWith(2);
  });
});
