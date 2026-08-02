import { act, render } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

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
