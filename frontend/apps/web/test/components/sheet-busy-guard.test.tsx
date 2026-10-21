import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * 하단 시트 전송 중(busy) 닫힘 가드 — DialogContent busy(#912)와 같은 의미다.
 * 스와이프 닫기는 끌어내린 위치를 남긴 채 닫기 콜백을 부르므로 콜백에서 거부하면 패널이 어긋난 채 남는다 —
 * busy 동안은 제스처 자체가 꺼져야 한다. 제스처 수치는 sheet-swipe-dismiss.test.tsx 의 "거리 경로" 와 같다.
 */
const SHEET_HEIGHT = 400;

/** performance.now() 가 읽을 가짜 시각. */
let currentTime = 0;

function renderSheet(busy: boolean | undefined, onOpenChange: (next: boolean) => void) {
  render(
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent side="bottom" busy={busy} aria-describedby={undefined} data-testid="sheet">
        <SheetTitle>정보 확인</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  const content = screen.getByTestId('sheet');
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
  });
  return content;
}

// 상단 56px 핸들 영역에서 200px 를 느리게 내린다 — busy 가 아니면 이 제스처로 닫힌다(대조 테스트).
function swipeDown(content: HTMLElement) {
  currentTime = 0;
  fireEvent.pointerDown(content, { pointerId: 1, clientX: 100, clientY: 10 });
  currentTime = 500;
  fireEvent.pointerMove(content, { pointerId: 1, clientX: 100, clientY: 30 });
  currentTime = 1000;
  fireEvent.pointerMove(content, { pointerId: 1, clientX: 100, clientY: 210 });
  fireEvent.pointerUp(content, { pointerId: 1, clientX: 100, clientY: 210 });
}

// Radix 는 바깥 감지 리스너를 setTimeout(0) 안에서 등록한다 — 한 틱을 흘린 뒤에 쏴야 실제 경로를 탄다.
async function flushOutsideListener() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
  });
}

beforeEach(() => {
  currentTime = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  // jsdom 에는 matchMedia 가 없다 — reduced-motion 아님으로 스텁(useSwipeDismiss 가 읽는다).
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
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('SheetContent 전송 중 닫힘 가드', () => {
  it('전송 중에는 ESC 로 닫히지 않는다', () => {
    const onOpenChange = vi.fn();
    renderSheet(true, onOpenChange);

    fireEvent.keyDown(screen.getByText('정보 확인'), { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // 바깥 닫힘을 pointerdown 이 아니라 뒤따르는 click 에서 판정하는 Radix 버전도 있다(#1331) — 둘 다 쏜다.
  it('전송 중에는 바깥을 눌러도 닫히지 않는다', async () => {
    const onOpenChange = vi.fn();
    renderSheet(true, onOpenChange);
    await flushOutsideListener();

    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('전송 중에는 아래로 스와이프해도 닫히지 않고 패널을 끌어내리지 않는다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet(true, onOpenChange);

    swipeDown(content);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(content.style.transform).toBe('');
  });

  // 위 세 단언이 공허하지 않다는 근거 — 같은 조작이 busy 가 아니면 실제로 닫는다.
  it('전송 중이 아니면 같은 스와이프로 닫힌다', () => {
    const onOpenChange = vi.fn();
    const content = renderSheet(false, onOpenChange);

    swipeDown(content);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('전송 중이 아니면 바깥을 눌러 닫힌다', async () => {
    const onOpenChange = vi.fn();
    renderSheet(false, onOpenChange);
    await flushOutsideListener();

    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('전송 중임을 영역 상태로 표기한다', () => {
    renderSheet(true, vi.fn());
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  });

  it('busy 를 넘기지 않으면 aria-busy 속성이 없다(기존 시트 무변화)', () => {
    renderSheet(undefined, vi.fn());
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-busy');
  });
});
