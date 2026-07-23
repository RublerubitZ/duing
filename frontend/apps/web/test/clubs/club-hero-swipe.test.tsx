import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ClubHeroActivity } from '@duing/types';
import { ClubHeroSwipe } from '../../app/clubs/[clubId]/_components/ClubHeroSwipe';

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

describe('ClubHeroSwipe — 모바일 스와이프(학생 래퍼)', () => {
  it('전 카드 + 도트를 렌더하고 첫 도트가 활성이다', () => {
    render(<ClubHeroSwipe heroActivities={[1, 2, 3].map((n) => make(n, n))} onOpen={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /자세히 보기/ })).toHaveLength(3);
    const dots = screen.getAllByRole('button', { name: /번째 대표 활동/ });
    expect(dots).toHaveLength(3);
    expect(dots[0]?.firstElementChild?.className).toContain('w-5'); // 활성 도트 확대(시각은 내부 span, 버튼은 히트 영역)
  });

  it('스크롤 위치에 따라 활성 도트가 바뀐다', () => {
    render(<ClubHeroSwipe heroActivities={[1, 2, 3].map((n) => make(n, n))} onOpen={vi.fn()} />);
    const track = screen.getByTestId('hero-swipe-track');
    Object.defineProperty(track, 'clientWidth', { value: 300, configurable: true });
    Object.defineProperty(track, 'scrollLeft', { value: 600, configurable: true });
    fireEvent.scroll(track);
    expect(screen.getAllByRole('button', { name: /번째 대표 활동/ })[2]?.firstElementChild?.className).toContain('w-5');
  });

  it('카드 클릭 시 해당 인덱스로 onOpen 을 부른다', () => {
    const onOpen = vi.fn();
    render(<ClubHeroSwipe heroActivities={[1, 2, 3].map((n) => make(n, n))} onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: '활동3 자세히 보기' }));
    expect(onOpen).toHaveBeenCalledWith(2);
  });

  it('컨테이너가 네이티브 dragstart 를 차단한다(캐러셀 스와이프 가드)', () => {
    render(<ClubHeroSwipe heroActivities={[make(1, 1)]} onOpen={vi.fn()} />);
    const track = screen.getByTestId('hero-swipe-track');
    const dragEvent = createEvent.dragStart(track);
    fireEvent(track, dragEvent);
    expect(dragEvent.defaultPrevented).toBe(true);
  });
});
