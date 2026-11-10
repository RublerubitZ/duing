import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CategoryRail } from '../../app/_components/sections/CategoryRail';

function renderRail() {
  return render(
    <CategoryRail heading={<h2>내게 맞는 카테고리</h2>} mobile={<div data-testid="mobile-tiles" />}>
      <a href="/clubs?category=ACADEMIC">학술</a>
      <a href="/clubs?category=HOBBY">취미</a>
    </CategoryRail>,
  );
}

/** jsdom 은 레이아웃을 계산하지 않는다 — 스크롤 줄의 치수를 직접 박는다. */
function sizeScroller(container: HTMLElement, { scrollLeft, clientWidth, scrollWidth }: { scrollLeft: number; clientWidth: number; scrollWidth: number }) {
  const scroller = container.querySelector('.overflow-x-auto');
  if (!(scroller instanceof HTMLElement)) throw new Error('스크롤 줄을 찾지 못했다');
  Object.defineProperty(scroller, 'scrollLeft', { configurable: true, value: scrollLeft });
  Object.defineProperty(scroller, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(scroller, 'scrollWidth', { configurable: true, value: scrollWidth });
  return scroller;
}

describe('CategoryRail — 홈 카테고리 줄의 이전·다음 버튼', () => {
  const scrollBy = vi.fn();

  beforeEach(() => {
    Element.prototype.scrollBy = scrollBy;
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
  });
  afterEach(() => scrollBy.mockReset());

  it('맨 앞에서는 이전이 꺼져 있고 다음이 켜져 있다 — 제목·모바일 타일·카드는 그대로 그린다', () => {
    const { container } = renderRail();
    fireEvent.scroll(sizeScroller(container, { scrollLeft: 0, clientWidth: 1200, scrollWidth: 2280 }));
    expect(screen.getByRole('heading', { name: '내게 맞는 카테고리' })).toBeInTheDocument();
    expect(screen.getByTestId('mobile-tiles')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '학술' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이전 카테고리' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 카테고리' })).toBeEnabled();
  });

  it('다음을 누르면 화면에 다 들어오는 카드 수만큼 오른쪽으로, 이전은 왼쪽으로 민다', () => {
    const { container } = renderRail();
    const scroller = sizeScroller(container, { scrollLeft: 400, clientWidth: 1200, scrollWidth: 2280 });
    fireEvent.scroll(scroller);

    fireEvent.click(screen.getByRole('button', { name: '다음 카테고리' }));
    // 1200 폭에는 카드(264 + 간격 24)가 4장 들어온다 → 4 × 288
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 1152, behavior: 'smooth' });

    fireEvent.click(screen.getByRole('button', { name: '이전 카테고리' }));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: -1152, behavior: 'smooth' });
  });

  it('끝까지 밀리면 다음이 꺼지고 이전이 켜진다', () => {
    const { container } = renderRail();
    const scroller = sizeScroller(container, { scrollLeft: 1080, clientWidth: 1200, scrollWidth: 2280 });
    fireEvent.scroll(scroller);

    expect(screen.getByRole('button', { name: '다음 카테고리' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '이전 카테고리' })).toBeEnabled();
  });

  it('넘칠 것이 없으면(줄이 화면에 다 들어오면) 두 버튼 모두 꺼진다', () => {
    const { container } = renderRail();
    fireEvent.scroll(sizeScroller(container, { scrollLeft: 0, clientWidth: 2400, scrollWidth: 2280 }));

    expect(screen.getByRole('button', { name: '이전 카테고리' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 카테고리' })).toBeDisabled();
  });

  it('움직임 줄이기를 켠 사용자에게는 부드러운 스크롤 없이 바로 옮긴다', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    const { container } = renderRail();
    fireEvent.scroll(sizeScroller(container, { scrollLeft: 0, clientWidth: 1200, scrollWidth: 2280 }));

    fireEvent.click(screen.getByRole('button', { name: '다음 카테고리' }));
    expect(scrollBy).toHaveBeenLastCalledWith({ left: 1152, behavior: 'auto' });
  });
});
