import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Sheet, SheetContent, SheetTitle } from '../../components/ui/sheet';

/**
 * 바텀시트 스와이프 닫기(useSwipeDismiss) 단위 테스트.
 *
 * 스펙: docs/superpowers/specs/2026-09-13-bottom-sheet-swipe-dismiss-design.md §3
 * - 시트 높이는 jsdom 이 0 을 주므로 getBoundingClientRect 를 400px 로 고정한다.
 * - 속도 판정은 performance.now() 를 주입해 결정적으로 만든다(이벤트 timeStamp 가 아니다).
 */

const SHEET_HEIGHT = 400;

/** performance.now() 가 읽을 가짜 시각. 각 제스처 스텝 직전에 옮겨 준다. */
let currentTime = 0;

function mockSheetRect(content: HTMLElement) {
  vi.spyOn(content, 'getBoundingClientRect').mockReturnValue({
    width: 390,
    height: SHEET_HEIGHT,
    top: 0,
    left: 0,
    right: 390,
    bottom: SHEET_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

type Step = { y: number; at: number };

function pointerDown(target: HTMLElement, { y, at }: Step) {
  currentTime = at;
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: y });
}

function pointerMove(target: HTMLElement, { y, at }: Step) {
  currentTime = at;
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 100, clientY: y });
}

function pointerUp(target: HTMLElement, { y, at }: Step) {
  currentTime = at;
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY: y });
}

function sheetTree(side: 'bottom' | 'right', open: boolean, onOpenChange: (next: boolean) => void) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={side} aria-describedby={undefined} data-testid="sheet">
        <SheetTitle>테스트 시트</SheetTitle>
        <div data-testid="scroller" className="overflow-y-auto">
          <p data-testid="row">목록 항목</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function renderSheet(side: 'bottom' | 'right', onOpenChange: (next: boolean) => void) {
  render(sheetTree(side, true, onOpenChange));
  const content = screen.getByTestId('sheet');
  mockSheetRect(content);
  return content;
}

describe('SheetContent — 아래로 스와이프해 닫기', () => {
  beforeEach(() => {
    currentTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
    // jsdom 에는 matchMedia 가 없다 — reduced-motion 아님(기본 모션)으로 스텁.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('상단 56px 핸들 영역에서 200px 를 느리게 내리면 시트가 닫힌다(거리 경로)', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);

    pointerDown(content, { y: 10, at: 0 });
    pointerMove(content, { y: 30, at: 500 });
    pointerMove(content, { y: 210, at: 1000 });
    pointerUp(content, { y: 210, at: 1000 });

    // 200px ≥ 400 × 0.25. 마지막 100ms 속도는 0 이라 순수 거리로 닫힌다.
    expect(onOpenChange).toHaveBeenCalledWith(false);
    // 닫힘 연출은 Radix 퇴장 키프레임에 맡기므로 인라인 transform 은 그대로 남는다.
    expect(content.style.transform).not.toBe('');
  });

  it('60px 만 느리게 내리면 닫히지 않고 스냅백한다', async () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);

    pointerDown(content, { y: 10, at: 0 });
    pointerMove(content, { y: 30, at: 500 });
    pointerMove(content, { y: 70, at: 2000 });
    pointerUp(content, { y: 70, at: 2000 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
    await waitFor(() => {
      expect(content.style.transition).toBe('');
    });
  });

  it('안쪽 스크롤러가 이미 내려가 있으면(scrollTop > 0) 아래 드래그를 무시한다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);
    const scroller = screen.getByTestId('scroller');
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, value: 50, writable: true });
    const row = screen.getByTestId('row');

    // 핸들 영역 밖(y=200)에서, 스크롤된 조상 안쪽에서 시작한 제스처.
    pointerDown(row, { y: 200, at: 0 });
    pointerMove(row, { y: 260, at: 500 });
    pointerMove(row, { y: 400, at: 1000 });
    pointerUp(row, { y: 400, at: 1000 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
  });

  it('콘텐츠 자체가 스크롤러이고 내려가 있으면 상단 56px 에서 빠르게 아래로 플릭해도 닫지 않는다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);
    // 시설 빠른 예약 시트처럼 콘텐츠가 곧 스크롤러다 — 목록을 내려 둔 채 위로 되돌리려는 제스처가
    // 핸들 영역에서 시작했다는 이유로 시트를 닫으면 입력 중인 신청 폼이 사라진다.
    content.style.overflowY = 'auto';
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 800, writable: true });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400, writable: true });
    Object.defineProperty(content, 'scrollTop', { configurable: true, value: 50, writable: true });

    pointerDown(content, { y: 10, at: 0 });
    pointerMove(content, { y: 30, at: 1000 });
    pointerMove(content, { y: 70, at: 1040 });
    pointerUp(content, { y: 70, at: 1040 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
  });

  it('콘텐츠가 스크롤 가능하면 맨 위에서 상단 56px 를 위로 밀어도 잠그지 않고 스크롤에 양보한다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);
    // scrollTop 은 jsdom 기본값 0 — 맨 위.
    content.style.overflowY = 'auto';
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 800, writable: true });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400, writable: true });

    pointerDown(content, { y: 40, at: 0 });
    pointerMove(content, { y: 20, at: 500 });

    // 여기서 잠그면 터치에서는 touchmove preventDefault 로 목록 스크롤까지 막힌다.
    expect(content.style.transform).toBe('');
  });

  it('넘치지만 스크롤러가 아닌 콘텐츠(overflow-y: hidden)는 상단 56px 를 위로 밀면 저항을 두고 따라온다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);
    // 탐색 필터 시트처럼 콘텐츠가 overflow-hidden 이면 넘쳐도 스크롤되지 않는다 — 헤더의 저항 드래그는 유지.
    content.style.overflowY = 'hidden';
    Object.defineProperty(content, 'scrollHeight', { configurable: true, value: 800, writable: true });
    Object.defineProperty(content, 'clientHeight', { configurable: true, value: 400, writable: true });

    pointerDown(content, { y: 40, at: 0 });
    pointerMove(content, { y: 20, at: 500 });

    // 위로 20px ÷ 저항 4.
    expect(content.style.transform).toBe('translateY(-5px)');
  });

  it('거리가 모자라도 빠른 플릭이면 닫힌다(속도 경로)', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);

    pointerDown(content, { y: 10, at: 0 });
    pointerMove(content, { y: 30, at: 1000 });
    pointerMove(content, { y: 70, at: 1040 });
    pointerUp(content, { y: 70, at: 1040 });

    // 60px < 100px(거리 미달) 이지만 마지막 100ms 에서 40px/40ms = 1px/ms > 0.4.
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('side="right" 시트는 같은 제스처에 반응하지 않는다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('right', onOpenChange);

    pointerDown(content, { y: 10, at: 0 });
    pointerMove(content, { y: 30, at: 500 });
    pointerMove(content, { y: 210, at: 1000 });
    pointerUp(content, { y: 210, at: 1000 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
  });

  it('닫힌 시트는 document 에 touchmove 리스너를 걸지 않는다', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener');

    render(sheetTree('bottom', false, vi.fn()));

    // non-passive touchmove 가 남으면 시트를 안 쓰는 페이지의 모든 터치 스크롤이 핸들러를 기다린다.
    expect(addEventListener.mock.calls.some(([type]) => type === 'touchmove')).toBe(false);
  });

  it('탭·8px 미만 이동은 아무것도 건드리지 않는다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);

    // 단순 탭.
    pointerDown(content, { y: 10, at: 0 });
    pointerUp(content, { y: 10, at: 80 });
    // 잠금 임계 미만(5px).
    pointerDown(content, { y: 10, at: 200 });
    pointerMove(content, { y: 15, at: 240 });
    pointerUp(content, { y: 15, at: 280 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
    expect(content.style.transition).toBe('');
  });

  it('드래그 중 pointercancel 이 오면 닫지 않고 스냅백한다', async () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);

    pointerDown(content, { y: 10, at: 0 });
    pointerMove(content, { y: 30, at: 500 });
    pointerMove(content, { y: 210, at: 1000 });
    fireEvent.pointerCancel(content, { pointerId: 1, clientX: 100, clientY: 210 });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
    await waitFor(() => {
      expect(content.style.transition).toBe('');
    });
  });

  it('pointerup 을 놓친 마우스가 버튼 없이 움직이면 드래그를 끝내고 스냅백한 뒤 다음 드래그를 받는다', async () => {
    const onOpenChange = vi.fn();
    const content = renderSheet('bottom', onOpenChange);

    pointerDown(content, { y: 10, at: 0 });
    pointerMove(content, { y: 30, at: 500 });
    expect(content.style.transform).toBe('translateY(20px)');

    // 창 밖에서 버튼을 떼면 pointerup 이 오지 않는다 — 그 뒤의 이동은 buttons 0 으로 들어온다.
    fireEvent.pointerMove(content, {
      pointerId: 1,
      pointerType: 'mouse',
      buttons: 0,
      clientX: 100,
      clientY: 60,
    });

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
    await waitFor(() => {
      expect(content.style.transition).toBe('');
    });

    // 드래그 상태가 남아 있으면 새 pointerdown 이 무시돼 시트가 다시는 손을 따라오지 않는다.
    pointerDown(content, { y: 10, at: 2000 });
    pointerMove(content, { y: 40, at: 2500 });
    expect(content.style.transform).toBe('translateY(30px)');
  });
});
