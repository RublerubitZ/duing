import { afterEach, describe, expect, it, vi } from 'vitest';

import { scrollToPaginatedListStart } from '@/app/_lib/paginationScroll';

type AnchoredList = { anchor: HTMLElement; button: HTMLButtonElement; scrollIntoView: ReturnType<typeof vi.fn> };

/** 표지(목록 영역) 안에 페이지 버튼이 있는 DOM — jsdom 은 배치를 계산하지 않아 위치·스크롤을 대역으로 준다. */
function buildAnchoredList(anchorTop: number, scrollMarginTop?: string): AnchoredList {
  const anchor = document.createElement('section');
  anchor.setAttribute('data-pagination-anchor', '');
  // jsdom 29 는 인라인 scroll-margin-top 을 getComputedStyle 로 그대로 읽는다(Tailwind 클래스는 계산하지 않는다).
  if (scrollMarginTop !== undefined) anchor.setAttribute('style', `scroll-margin-top: ${scrollMarginTop}`);
  anchor.getBoundingClientRect = () => new DOMRect(0, anchorTop, 320, 900);
  const scrollIntoView = vi.fn();
  anchor.scrollIntoView = scrollIntoView;
  const button = document.createElement('button');
  button.textContent = '다음';
  anchor.append(document.createElement('ul'), button);
  document.body.append(anchor);
  return { anchor, button, scrollIntoView };
}

describe('scrollToPaginatedListStart', () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it('표지가 없으면 화면 맨 위로 간다 — 목록이 그 화면의 첫 내용이다', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const button = document.createElement('button');
    document.body.append(button);

    scrollToPaginatedListStart(button);

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it('표지의 위가 화면 위로 벗어났으면 그 위로 간다', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const { button, scrollIntoView } = buildAnchoredList(-480);

    scrollToPaginatedListStart(button);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('표지의 위가 이미 보이면 움직이지 않는다', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo');
    const { button, scrollIntoView } = buildAnchoredList(120);

    scrollToPaginatedListStart(button);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('표지의 위가 상단 고정 바 밑(scroll-margin-top 안)이면 가려진 것이라 움직인다', () => {
    const { button, scrollIntoView } = buildAnchoredList(40, '64px');

    scrollToPaginatedListStart(button);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
  });

  it('표지가 겹치면 누른 버튼에 가장 가까운 표지로 간다', () => {
    const outer = document.createElement('main');
    outer.setAttribute('data-pagination-anchor', '');
    outer.getBoundingClientRect = () => new DOMRect(0, -900, 320, 2000);
    const outerScrollIntoView = vi.fn();
    outer.scrollIntoView = outerScrollIntoView;
    document.body.append(outer);
    const { anchor, button, scrollIntoView } = buildAnchoredList(-200);
    outer.append(anchor);

    scrollToPaginatedListStart(button);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
    expect(outerScrollIntoView).not.toHaveBeenCalled();
  });
});
