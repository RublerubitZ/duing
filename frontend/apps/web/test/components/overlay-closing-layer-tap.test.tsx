import * as DialogPrimitive from '@radix-ui/react-dialog';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * 겹친 오버레이 — 닫히는 다이얼로그에서 시작한 탭을 아래 시트·다이얼로그가 바깥 탭으로 받지 않는다.
 *
 * 학기별 정보 확인 팝업(하단 시트)에서 형제로 뜬 수정 창의 "취소"를 터치하면 팝업까지 닫혔다. Radix 는 터치
 * pointerdown 의 바깥 판정을 뒤따르는 click 때로 미루는데, 그 사이 "취소"가 수정 창을 닫아 바깥 포인터
 * 차단이 풀린 아래 레이어가 그 탭을 바깥 탭으로 받았다.
 */
type LowerKind = 'sheet' | 'dialog';
type UpperKind = 'none' | 'raw' | 'shared';

type HarnessProps = {
  lower: LowerKind;
  upper: UpperKind;
  upperOpen: boolean;
  seenPrevented: boolean[];
  upperSeenPrevented: boolean[];
  onLowerOpenChange: (open: boolean) => void;
  onUpperOpenChange: (open: boolean) => void;
};

// 래퍼는 가드 뒤에 소비처 핸들러를 부른다 — 가드의 판정(defaultPrevented)이 seenPrevented 에 그대로 쌓인다.
// 판정이 아예 안 돌면(틱 누락·Radix 변경) 배열이 비어 단언이 실패한다.
function LowerLayer({ lower, seenPrevented, onLowerOpenChange }: HarnessProps) {
  if (lower === 'sheet') {
    return (
      <Sheet open onOpenChange={onLowerOpenChange}>
        <SheetContent
          side="bottom"
          aria-describedby={undefined}
          onPointerDownOutside={(event) => seenPrevented.push(event.defaultPrevented)}
        >
          <SheetTitle>정보 확인</SheetTitle>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Dialog open onOpenChange={onLowerOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        onPointerDownOutside={(event) => seenPrevented.push(event.defaultPrevented)}
      >
        <DialogTitle>정보 확인</DialogTitle>
      </DialogContent>
    </Dialog>
  );
}

function UpperLayer({ upper, upperOpen, upperSeenPrevented, onUpperOpenChange }: HarnessProps) {
  if (upper === 'none') return null;
  if (upper === 'shared') {
    // 공용 Dialog 는 jsdom 에 애니메이션이 없어 닫으면 바로 빠진다 — 떨어진 노드 경로.
    // 이 래퍼의 판정도 아래와 같은 방식으로 upperSeenPrevented 에 쌓는다((f′) 가 본다).
    return (
      <Dialog open={upperOpen} onOpenChange={onUpperOpenChange}>
        <DialogContent
          aria-describedby={undefined}
          onPointerDownOutside={(event) => upperSeenPrevented.push(event.defaultPrevented)}
        >
          <DialogTitle>정보 수정</DialogTitle>
          <button type="button">취소</button>
        </DialogContent>
      </Dialog>
    );
  }
  // 실제 엔진에서 닫힘 애니메이션 동안 data-state="closed" 로 남는 콘텐츠를 흉내 낸다.
  // forceMount 는 Portal 쪽이 필수다 — Portal 이 자식마다 Presence 로 감싸고 Content 는 PortalProvider 에서
  // 물려받는다. Content 에만 두면 Portal 의 Presence 가 닫을 때 빼 버려 떨어진 노드 경로로 퇴화한다.
  return (
    <DialogPrimitive.Root open={upperOpen} onOpenChange={onUpperOpenChange}>
      <DialogPrimitive.Portal forceMount>
        <DialogPrimitive.Overlay data-testid="upper-scrim" />
        <DialogPrimitive.Content aria-describedby={undefined}>
          <DialogPrimitive.Title>정보 수정</DialogPrimitive.Title>
          <button type="button">취소</button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// 위 레이어는 아래 레이어의 React 트리 밖 형제다 — 팝업 시트와 수정 창의 실제 구조.
function Harness(props: HarnessProps) {
  return (
    <>
      <LowerLayer {...props} />
      <UpperLayer {...props} />
    </>
  );
}

// Radix 는 바깥 감지 리스너를 setTimeout(0) 안에서 등록한다 — 한 틱을 흘린 뒤에 쏴야 실제 경로를 탄다.
async function flushOutsideListener() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
  });
}

// 아래 레이어를 먼저 띄운 뒤 위 레이어를 연다 — 실제 순서이자 Radix 레이어 순서(마운트 순)다.
// 한 번에 마운트하면 아래의 hideOthers 가 위 포털까지 aria-hidden 으로 덮어 "취소" 질의가 던진다.
async function renderLayers(lower: LowerKind, upper: UpperKind) {
  const seenPrevented: boolean[] = [];
  const upperSeenPrevented: boolean[] = [];
  const onLowerOpenChange = vi.fn();
  const onUpperOpenChange = vi.fn();
  const baseProps = {
    lower,
    seenPrevented,
    upperSeenPrevented,
    onLowerOpenChange,
    onUpperOpenChange,
  };
  const { rerender } = render(<Harness {...baseProps} upper="none" upperOpen={false} />);
  await flushOutsideListener();
  rerender(<Harness {...baseProps} upper={upper} upperOpen />);
  await flushOutsideListener();
  const closeUpper = () => rerender(<Harness {...baseProps} upper={upper} upperOpen={false} />);
  return { seenPrevented, upperSeenPrevented, onLowerOpenChange, onUpperOpenChange, closeUpper };
}

// 순서 흉내 — jsdom 에서 "취소"를 fireEvent 로 그대로 click 하면 결함이 재현되지 않았다(단언이 공허해진다).
// act 안에서는 리스너 사이 재렌더가 일어나지 않는 것으로 보인다. 그래서 브라우저 순서를 단계로 나눈다.
// pointerdown(touch) 으로 아래 레이어가 document click 리스너를 걸고, "취소" onClick 과 그 렌더가 먼저 끝난
// 상태(위 닫힘)를 만든 뒤, 호출부가 click 을 쏘면 그 리스너가 원래 pointerdown 대상으로 판정한다.
function touchCancelWhileUpperCloses(closeUpper: () => void): HTMLElement {
  const cancel = screen.getByRole('button', { name: '취소' });
  fireEvent.pointerDown(cancel, { pointerType: 'touch', button: 0 });
  closeUpper();
  return cancel;
}

describe('겹친 오버레이 — 닫히는 위 다이얼로그에서 시작한 탭', () => {
  it('(a) 아래 시트는 닫힘 연출 중인 위 다이얼로그의 "취소" 탭으로 닫히지 않는다', async () => {
    const { seenPrevented, onLowerOpenChange, closeUpper } = await renderLayers('sheet', 'raw');

    const cancel = touchCancelWhileUpperCloses(closeUpper);
    expect(cancel.isConnected).toBe(true);
    expect(cancel.closest('[role="dialog"]')).toHaveAttribute('data-state', 'closed');
    fireEvent.click(document.body);

    expect(seenPrevented).toEqual([true]);
    expect(onLowerOpenChange).not.toHaveBeenCalled();
  });

  it('(b) 아래 다이얼로그도 같은 탭으로 닫히지 않는다', async () => {
    const { seenPrevented, onLowerOpenChange, closeUpper } = await renderLayers('dialog', 'raw');

    const cancel = touchCancelWhileUpperCloses(closeUpper);
    expect(cancel.isConnected).toBe(true);
    expect(cancel.closest('[role="dialog"]')).toHaveAttribute('data-state', 'closed');
    fireEvent.click(document.body);

    expect(seenPrevented).toEqual([true]);
    expect(onLowerOpenChange).not.toHaveBeenCalled();
  });

  // 위 Dialog 는 닫힐 때 history.back() 으로 엔트리를 회수한다 — seenPrevented 가 뒤로가기 닫힘과 구분해 준다.
  it('(c) 아래 시트는 닫히며 바로 빠진 위 공용 다이얼로그의 "취소" 탭으로 닫히지 않는다', async () => {
    const { seenPrevented, onLowerOpenChange, closeUpper } = await renderLayers('sheet', 'shared');

    const cancel = touchCancelWhileUpperCloses(closeUpper);
    expect(cancel.isConnected).toBe(false);
    fireEvent.click(document.body);

    expect(seenPrevented).toEqual([true]);
    expect(onLowerOpenChange).not.toHaveBeenCalled();
  });

  it('(d) 위 레이어가 없으면 아래 시트 바깥 터치로 닫힌다', async () => {
    const { seenPrevented, onLowerOpenChange } = await renderLayers('sheet', 'none');

    fireEvent.pointerDown(document.body, { pointerType: 'touch', button: 0 });
    fireEvent.click(document.body);

    expect(seenPrevented).toEqual([false]);
    expect(onLowerOpenChange).toHaveBeenCalledWith(false);
  });

  it('(e) 마우스로 바깥을 누르면 click 을 기다리지 않고 바로 닫힌다', async () => {
    const { seenPrevented, onLowerOpenChange } = await renderLayers('sheet', 'none');

    fireEvent.pointerDown(document.body, { pointerType: 'mouse', button: 0 });

    expect(seenPrevented).toEqual([false]);
    expect(onLowerOpenChange).toHaveBeenCalledWith(false);
  });

  it('(f) 열린 위 다이얼로그의 스크림을 터치하면 위만 닫히고 아래는 남는다', async () => {
    const { onLowerOpenChange, onUpperOpenChange } = await renderLayers('sheet', 'raw');
    const scrim = screen.getByTestId('upper-scrim');

    fireEvent.pointerDown(scrim, { pointerType: 'touch', button: 0 });
    fireEvent.click(scrim);

    expect(onUpperOpenChange).toHaveBeenCalledWith(false);
    expect(onLowerOpenChange).not.toHaveBeenCalled();
  });

  // (f) 의 위는 원시 Dialog 라 래퍼 가드를 타지 않는다. 여기서는 위가 공용 래퍼일 때 가드가 그 레이어 자신의 진짜
  // 바깥 탭을 잘못 막지 않는지 고정한다 — develop 래퍼에서도 통과하는 회귀 울타리다. 공용 DialogContent 의 스크림은
  // 잡을 손잡이가 없어, 스크림처럼 열린 모달의 바깥인 document.body 를 터치한다(아래 시트는 위가 열려 있어 판정을 건너뛴다).
  it('(f′) 위가 공용 다이얼로그여도 열린 위 레이어의 바깥(스크림)을 터치하면 위만 닫히고 아래는 남는다', async () => {
    const { upperSeenPrevented, onLowerOpenChange, onUpperOpenChange } = await renderLayers(
      'sheet',
      'shared',
    );

    fireEvent.pointerDown(document.body, { pointerType: 'touch', button: 0 });
    fireEvent.click(document.body);

    expect(upperSeenPrevented).toEqual([false]);
    expect(onUpperOpenChange).toHaveBeenCalledTimes(1);
    expect(onUpperOpenChange).toHaveBeenCalledWith(false);
    expect(onLowerOpenChange).not.toHaveBeenCalled();
  });

  // 마우스는 pointerdown 즉시 판정해 위가 이미 닫히는 중일 때만 걸린다(사라지는 창을 빠르게 다시 누른 경우).
  it('마우스로 닫힘 연출 중인 위 다이얼로그를 다시 눌러도 아래는 남는다', async () => {
    const { seenPrevented, onLowerOpenChange, closeUpper } = await renderLayers('sheet', 'raw');
    const cancel = screen.getByRole('button', { name: '취소' });

    closeUpper();
    expect(cancel.isConnected).toBe(true);
    expect(cancel.closest('[role="dialog"]')).toHaveAttribute('data-state', 'closed');
    fireEvent.pointerDown(cancel, { pointerType: 'mouse', button: 0 });

    expect(seenPrevented).toEqual([true]);
    expect(onLowerOpenChange).not.toHaveBeenCalled();
  });
});
