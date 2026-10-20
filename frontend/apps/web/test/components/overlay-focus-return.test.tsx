import { StrictMode, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';

/**
 * 공용 시트·다이얼로그가 닫히면 열기 직전 포커스 자리로 되돌린다(overlayFocusReturn).
 *
 * 타이밍: 되돌림은 Radix FocusScope 언마운트 정리의 setTimeout(0) 안에서 일어나 닫은 직후 동기 확인은 고친 뒤에도
 * body 다. 그래서 "돌아온다"는 waitFor 로 기다리고, "돌아오지 않는다"는 막지 않는 소비처 onCloseAutoFocus 스파이가
 * 불린 것(닫힘 처리가 끝난 것)을 기다린 뒤 단언한다 — 기다리지 않으면 고치기 전에도 통과하는 공허한 단언이 된다.
 *
 * jsdom 은 click 이 포커스를 옮기지 않는다 — 키보드·포커스를 옮기는 클릭(Chrome 계열)은 `focus()` 뒤 click 으로
 * 흉내 내고, 포커스를 옮기지 않는 클릭·탭(Safari·iPhone 에서 그럴 수 있다)은 click 만 한다.
 */

type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /** (j) 래퍼가 export 하는 Trigger 를 함께 그린다. */
  withTrigger?: boolean;
  children?: ReactNode;
};

// 창 안: 제목(tabIndex=-1 — 소비처가 열 때 포커스를 둘 수 있게)·"취소"(상태로 닫기)·호출부가 넣는 내용.
function DialogUnderTest({
  open,
  onOpenChange,
  onOpenAutoFocus,
  onCloseAutoFocus,
  withTrigger = false,
  children,
}: OverlayProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {withTrigger && <DialogTrigger>트리거</DialogTrigger>}
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogTitle tabIndex={-1}>창 제목</DialogTitle>
        <button type="button" onClick={() => onOpenChange(false)}>
          취소
        </button>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function SheetUnderTest({
  open,
  onOpenChange,
  onOpenAutoFocus,
  onCloseAutoFocus,
  withTrigger = false,
  children,
}: OverlayProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {withTrigger && <SheetTrigger>트리거</SheetTrigger>}
      <SheetContent
        aria-describedby={undefined}
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <SheetTitle tabIndex={-1}>창 제목</SheetTitle>
        <button type="button" onClick={() => onOpenChange(false)}>
          취소
        </button>
        {children}
      </SheetContent>
    </Sheet>
  );
}

type PageProps = {
  Overlay: ComponentType<OverlayProps>;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  withTrigger?: boolean;
  /** (d) 창이 닫힌 커밋의 effect 에서 앱이 "다른 버튼"으로 포커스를 옮긴다. */
  focusOtherAfterClose?: boolean;
  /** (i) 열 때 마운트하고 닫을 때 통째로 언마운트한다 — `{open && <Dialog open>…}`(관리자 다이얼로그 다수의 모양). */
  mountOnlyWhileOpen?: boolean;
};

// 앱 소비처처럼 Trigger 없이 open 상태로 여닫는다. 창 안에는 "열기 버튼 지우기"(e)를 더 둔다.
function Page({
  Overlay,
  focusOtherAfterClose = false,
  mountOnlyWhileOpen = false,
  ...overlayProps
}: PageProps) {
  const [open, setOpen] = useState(false);
  const [openerShown, setOpenerShown] = useState(true);
  const otherRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (focusOtherAfterClose && wasOpenRef.current && !open) otherRef.current?.focus();
    wasOpenRef.current = open;
  }, [focusOtherAfterClose, open]);

  const overlay = (
    <Overlay open={open} onOpenChange={setOpen} {...overlayProps}>
      <button type="button" onClick={() => setOpenerShown(false)}>
        열기 버튼 지우기
      </button>
    </Overlay>
  );
  return (
    <>
      {openerShown && (
        <button type="button" onClick={() => setOpen(true)}>
          열기
        </button>
      )}
      <button type="button" ref={otherRef}>
        다른 버튼
      </button>
      <input aria-label="검색어" />
      <select aria-label="정렬">
        <option>최신순</option>
      </select>
      {mountOnlyWhileOpen ? open && overlay : overlay}
    </>
  );
}

// 소비처가 열 때 제목에 포커스를 둔다(ProfileCheckPrompt·BulkPromoteDialog 처럼 onOpenAutoFocus 를 막고 직접 옮긴다).
function focusTitleOnOpen(event: Event) {
  event.preventDefault();
  screen.getByRole('heading', { name: '창 제목' }).focus();
}

// 겹친 창 — 아래는 매개 래퍼(열린 채, 열 때 제목에 포커스), 위는 형제 Dialog(ProfileCheckPrompt 의 수정 창 모양).
// 아래가 DialogContent 면 PC 팝업, SheetContent 면 모바일 팝업 모양이다.
function StackedPage({ Overlay }: { Overlay: ComponentType<OverlayProps> }) {
  const [editOpen, setEditOpen] = useState(false);
  return (
    <>
      <Overlay open onOpenChange={() => undefined} onOpenAutoFocus={focusTitleOnOpen}>
        <button type="button" onClick={() => setEditOpen(true)}>
          정보 수정하기
        </button>
      </Overlay>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>프로필 수정</DialogTitle>
          <button type="button" onClick={() => setEditOpen(false)}>
            수정 취소
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

// 키보드(Enter·Space)나 포커스를 옮기는 클릭으로 연다 — 열기 직전 포커스가 그 버튼이다.
function focusAndClick(element: HTMLElement) {
  element.focus();
  fireEvent.click(element);
}

// 연 뒤 포커스가 창 안으로 들어갔다 — 아니면 "열기 버튼으로 돌아온다" 단언이 공허하다.
function expectFocusInsideDialog() {
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
}

describe.each([
  ['DialogContent', DialogUnderTest],
  ['SheetContent', SheetUnderTest],
])('%s — 닫히면 열기 직전 포커스로 되돌린다', (_wrapperName, Overlay) => {
  it('(a) 열기 버튼에서 열고 "취소"로 닫으면 열기 버튼으로 돌아온다', async () => {
    render(<Page Overlay={Overlay} />);
    const opener = screen.getByRole('button', { name: '열기' });

    focusAndClick(opener);
    expectFocusInsideDialog();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('(a) StrictMode 에서도 열기 버튼으로 돌아온다', async () => {
    render(
      <StrictMode>
        <Page Overlay={Overlay} />
      </StrictMode>,
    );
    const opener = screen.getByRole('button', { name: '열기' });

    focusAndClick(opener);
    expectFocusInsideDialog();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('(b) Escape 로 닫아도 열기 버튼으로 돌아온다', async () => {
    render(<Page Overlay={Overlay} />);
    const opener = screen.getByRole('button', { name: '열기' });

    focusAndClick(opener);
    expectFocusInsideDialog();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  // 고치기 전에도 통과하는 울타리 — 소비처가 막으면 손대지 않는다(지키는 것 1). 그 확인을 빼면 "정하지 않으면" 쪽이
  // 열기 버튼으로 돌아가 실패한다("다른 요소" 쪽은 닫는 순간 포커스가 이미 있어 지키는 것 2 가 함께 막는다).
  it.each([
    ['다른 요소를 포커스하면 그 요소', true],
    ['포커스를 정하지 않으면 body', false],
  ])('(c) 소비처가 onCloseAutoFocus 를 막고 %s 에 남는다', async (_label, focusOther) => {
    const onCloseAutoFocus = vi.fn((event: Event) => {
      event.preventDefault();
      if (focusOther) screen.getByRole('button', { name: '다른 버튼' }).focus();
    });
    render(<Page Overlay={Overlay} onCloseAutoFocus={onCloseAutoFocus} />);
    const other = screen.getByRole('button', { name: '다른 버튼' });

    focusAndClick(screen.getByRole('button', { name: '열기' }));
    expectFocusInsideDialog();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(focusOther ? other : document.body);
  });

  // 고치기 전에도 통과하는 울타리 — 닫는 순간 포커스가 이미 다른 요소에 있으면 덮어쓰지 않는다(지키는 것 2).
  it('(d) 창이 닫힌 뒤 앱이 옮긴 포커스는 덮어쓰지 않는다', async () => {
    const closeSpy = vi.fn();
    render(<Page Overlay={Overlay} onCloseAutoFocus={closeSpy} focusOtherAfterClose />);
    const other = screen.getByRole('button', { name: '다른 버튼' });

    focusAndClick(screen.getByRole('button', { name: '열기' }));
    expectFocusInsideDialog();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(other);
  });

  // 스모크 — 분리된 요소의 focus() 는 원래 no-op 이라 연결 확인(지키는 것 3)을 빼도 통과한다. 오류 없이 끝나는지만 본다.
  it('(e) 연 자리가 사라져도 오류 없이 body 에 남는다', async () => {
    const closeSpy = vi.fn();
    render(<Page Overlay={Overlay} onCloseAutoFocus={closeSpy} />);

    focusAndClick(screen.getByRole('button', { name: '열기' }));
    fireEvent.click(screen.getByRole('button', { name: '열기 버튼 지우기' }));
    expect(screen.queryByRole('button', { name: '열기', hidden: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
    expect(document.activeElement).toBe(document.body);
  });

  // 고치기 전에도 통과하는 울타리 — 입력 요소로는 되돌리지 않는다(지키는 것 4). 그 확인을 빼면 입력칸으로 돌아가 실패한다.
  it.each(['검색어', '정렬'])(
    '(f) 입력칸(%s)에 포커스를 둔 채 포커스를 옮기지 않는 클릭으로 열면, 닫아도 입력칸으로 가지 않는다',
    async (label) => {
      const closeSpy = vi.fn();
      render(<Page Overlay={Overlay} onCloseAutoFocus={closeSpy} />);
      const field = screen.getByLabelText(label);
      field.focus();

      fireEvent.click(screen.getByRole('button', { name: '열기' }));
      expectFocusInsideDialog();
      fireEvent.click(screen.getByRole('button', { name: '취소' }));

      await waitFor(() => expect(closeSpy).toHaveBeenCalledTimes(1));
      expect(document.activeElement).toBe(document.body);
    },
  );

  it('(g) 소비처 onOpenAutoFocus(제목 포커스)는 그대로 불리고, 닫으면 여전히 열기 버튼으로 돌아온다', async () => {
    const onOpenAutoFocus = vi.fn(focusTitleOnOpen);
    render(<Page Overlay={Overlay} onOpenAutoFocus={onOpenAutoFocus} />);
    const opener = screen.getByRole('button', { name: '열기' });

    focusAndClick(opener);
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: '창 제목' }));
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  // WebKit 실제 클릭은 버튼 대신 포커스 가능한 조상(아래 창 컨테이너 등)에 포커스를 줄 수 있어 결과가 다를 수 있다 — QA 로 본다.
  it.each([
    ['포커스를 옮기지 않는 클릭이면 아래 창 제목', false],
    ['포커스를 옮기는 클릭이면 그 버튼', true],
  ])('(h) 겹친 창에서 위 Dialog 를 닫으면 %s 으로 돌아온다', async (_label, focusBeforeClick) => {
    render(<StackedPage Overlay={Overlay} />);
    const editButton = screen.getByRole('button', { name: '정보 수정하기' });
    const lowerTitle = screen.getByRole('heading', { name: '창 제목' });
    expect(document.activeElement).toBe(lowerTitle);

    if (focusBeforeClick) focusAndClick(editButton);
    else fireEvent.click(editButton);
    expect(
      screen.getByRole('dialog', { name: '프로필 수정' }).contains(document.activeElement),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '수정 취소' }));

    await waitFor(() =>
      expect(document.activeElement).toBe(focusBeforeClick ? editButton : lowerTitle),
    );
  });

  it('(i) 열 때 마운트하고 닫을 때 언마운트하는 창도 열기 버튼으로 돌아온다', async () => {
    render(<Page Overlay={Overlay} mountOnlyWhileOpen />);
    const opener = screen.getByRole('button', { name: '열기' });

    focusAndClick(opener);
    expectFocusInsideDialog();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  // 고치기 전에도 통과하는 울타리 — 되돌리지 않을 때는 preventDefault 도 하지 않아 Radix 가 Trigger 로 보낸다.
  // 무조건 막으면 Trigger 복귀가 꺼져 실패한다.
  it('(j) Trigger 를 포커스 없이 눌러 연 창은 Radix 기본대로 Trigger 로 돌아온다', async () => {
    render(<Page Overlay={Overlay} withTrigger />);
    const trigger = screen.getByRole('button', { name: '트리거' });

    fireEvent.click(trigger);
    expectFocusInsideDialog();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
