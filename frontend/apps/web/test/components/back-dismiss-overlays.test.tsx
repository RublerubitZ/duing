import { act, fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearNavigationPending } from '@/app/_lib/backDismiss';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

// guarded router 를 쓰는 컴포넌트가 남긴 이동 예약(실 8s 타이머)이 뒤 케이스의 회수 back() 단언을
// 순서 의존으로 깨뜨리지 않도록 드레인한다 — 이 파일은 backDismiss 를 mock 하지 않는다.
afterEach(() => {
  clearNavigationPending();
});

// jsdom 의 traversal 은 태스크 큐에 실린다(실측 ~3ms) — popstate 발화 자체를 기다린다.
function nextPopState(): Promise<void> {
  return new Promise((resolve) => {
    window.addEventListener('popstate', () => resolve(), { once: true });
  });
}

async function pressBack() {
  // 엔트리를 물지 않은 상태에서 back() 하면 popstate 가 영원히 안 와 테스트가 타임아웃으로 끝난다.
  // 원인을 즉시 드러내기 위해 먼저 단언한다.
  expect(window.history.state.__overlayId).toEqual(expect.any(Number));
  const popped = nextPopState();
  await act(async () => {
    window.history.back();
    await popped;
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
}

describe('Radix 오버레이 뒤로가기 닫기', () => {
  it('Dialog 가 열린 상태의 뒤로가기는 다이얼로그만 닫는다', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogTitle>제목</DialogTitle>
          </DialogContent>
        </Dialog>
      );
    }

    const { queryByText } = render(<Host />);
    expect(queryByText('제목')).not.toBeNull();

    await pressBack();

    expect(queryByText('제목')).toBeNull();
  });

  it('Sheet 가 열린 상태의 뒤로가기는 시트만 닫는다', async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom">
            <SheetTitle>필터</SheetTitle>
          </SheetContent>
        </Sheet>
      );
    }

    const { queryByText } = render(<Host />);
    expect(queryByText('필터')).not.toBeNull();

    await pressBack();

    expect(queryByText('필터')).toBeNull();
  });

  // 정보 확인 팝업(시트) 위에 프로필 수정 다이얼로그를 겹쳐 여는 흐름 — 뒤로가기는 위에서부터 하나씩 닫는다.
  it('시트 위에 겹쳐 연 다이얼로그에서 뒤로가기는 다이얼로그만 닫고, 한 번 더 누르면 시트가 닫힌다', async () => {
    function Host() {
      const [sheetOpen, setSheetOpen] = useState(true);
      const [dialogOpen, setDialogOpen] = useState(false);
      return (
        <>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom">
              <SheetTitle>정보 확인</SheetTitle>
              <button type="button" onClick={() => setDialogOpen(true)}>
                정보 수정하기
              </button>
            </SheetContent>
          </Sheet>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogTitle>프로필 수정</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    const { getByRole, queryByText } = render(<Host />);
    fireEvent.click(getByRole('button', { name: '정보 수정하기' }));
    expect(queryByText('프로필 수정')).not.toBeNull();

    await pressBack();

    expect(queryByText('프로필 수정')).toBeNull();
    expect(queryByText('정보 확인')).not.toBeNull();

    await pressBack();

    expect(queryByText('정보 확인')).toBeNull();
  });

  it('닫힌 Dialog 는 히스토리 엔트리를 잡지 않는다', async () => {
    window.history.replaceState({ marker: 'page' }, '');
    render(
      <Dialog open={false} onOpenChange={() => undefined}>
        <DialogContent>
          <DialogTitle>숨김</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(window.history.state).toEqual({ marker: 'page' });
  });
});

// 정보 확인 팝업처럼 페이지가 뜨자마자 저절로 열린 시트 — 조작 전에는 기록을 미뤘다가 첫 조작 때 쌓는다.
describe('사용자 조작 전에 저절로 열린 오버레이', () => {
  // navigator.userActivation 흉내 — jsdom 에는 이 API 가 없다.
  let activated = false;

  beforeEach(() => {
    activated = false;
    Object.defineProperty(window.navigator, 'userActivation', {
      configurable: true,
      value: {
        get hasBeenActive() {
          return activated;
        },
        get isActive() {
          return activated;
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window.navigator, 'userActivation');
  });

  it('조작 전에 열린 시트는 첫 조작 때 기록을 쌓고, 그 위에 연 다이얼로그부터 뒤로가기로 닫힌다', async () => {
    function Host() {
      const [sheetOpen, setSheetOpen] = useState(true);
      const [dialogOpen, setDialogOpen] = useState(false);
      return (
        <>
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom">
              <SheetTitle>정보 확인</SheetTitle>
              <button type="button" onClick={() => setDialogOpen(true)}>
                정보 수정하기
              </button>
            </SheetContent>
          </Sheet>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent>
              <DialogTitle>프로필 수정</DialogTitle>
            </DialogContent>
          </Dialog>
        </>
      );
    }

    window.history.replaceState({ marker: 'page' }, '');
    const { getByRole, queryByText } = render(<Host />);
    expect(queryByText('정보 확인')).not.toBeNull();
    // 조작 전에 저절로 열린 시트는 기록을 쌓지 않는다.
    expect(window.history.state).toEqual({ marker: 'page' });

    // 첫 조작(터치를 떼는 순간 활성화) — 미뤄 둔 시트 기록을 먼저 쌓고, 이어진 click 이 다이얼로그를 연다.
    activated = true;
    const editButton = getByRole('button', { name: '정보 수정하기' });
    fireEvent.pointerUp(editButton);
    fireEvent.click(editButton);
    expect(queryByText('프로필 수정')).not.toBeNull();

    await pressBack();

    expect(queryByText('프로필 수정')).toBeNull();
    expect(queryByText('정보 확인')).not.toBeNull();

    await pressBack();

    expect(queryByText('정보 확인')).toBeNull();
    expect(window.history.state).toEqual({ marker: 'page' });
  });
});
