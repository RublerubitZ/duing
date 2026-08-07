import { act, render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

/**
 * 전송 중(`busy`) 닫힘 가드.
 *
 * 취소 버튼만 pending 으로 막고 ESC·바깥 클릭을 열어두면 같은 모달에서 버튼으로는 못 닫는데
 * 키보드로는 닫힌다. 사용자는 "취소됐다"고 이해하지만 요청은 그대로 진행돼, 되돌릴 수 없는
 * 작업에서는 모달이 사라진 뒤 결과만 뒤늦게 나타난다(#830).
 */
function renderDialog(busy: boolean | undefined, onOpenChange: (open: boolean) => void) {
  return render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent busy={busy} aria-describedby={undefined}>
        <DialogTitle>탈퇴할까요?</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
}

describe('DialogContent 전송 중 닫힘 가드', () => {
  it('전송 중에는 ESC 로 닫히지 않는다', () => {
    const onOpenChange = vi.fn();
    renderDialog(true, onOpenChange);

    fireEvent.keyDown(screen.getByText('탈퇴할까요?'), { key: 'Escape' });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  // Radix 는 바깥 감지 리스너를 setTimeout(0) 안에서 등록한다 — 렌더 직후 바로 이벤트를 쏘면
  // 리스너가 아직 없어 아무 일도 일어나지 않고, 가드를 꺼도 통과하는 공허한 단언이 된다.
  // 한 틱을 흘린 뒤에 쏴야 실제 경로를 탄다.
  async function flushOutsideListener() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });
  }

  it('전송 중에는 바깥을 눌러도 닫히지 않는다', async () => {
    const onOpenChange = vi.fn();
    renderDialog(true, onOpenChange);
    await flushOutsideListener();

    fireEvent.pointerDown(document.body);

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('전송 중임을 보조기술에 알린다', () => {
    renderDialog(true, vi.fn());

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
  });

  // 위 단언이 공허하지 않다는 근거 — 가드가 없으면 같은 조작으로 실제로 닫힌다.
  it('전송 중이 아니면 바깥을 눌러 닫힌다', async () => {
    const onOpenChange = vi.fn();
    renderDialog(false, onOpenChange);
    await flushOutsideListener();

    fireEvent.pointerDown(document.body);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('전송이 끝나면 ESC 로 다시 닫힌다', () => {
    const onOpenChange = vi.fn();
    const { rerender } = renderDialog(true, onOpenChange);

    rerender(
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent busy={false} aria-describedby={undefined}>
          <DialogTitle>탈퇴할까요?</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    fireEvent.keyDown(screen.getByText('탈퇴할까요?'), { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // busy 미전달 시 동작이 달라지면 이 prop 을 아직 안 붙인 다이얼로그 40여 곳이 함께 바뀐다.
  it('busy 를 넘기지 않으면 기존처럼 ESC 로 닫힌다', () => {
    const onOpenChange = vi.fn();
    renderDialog(undefined, onOpenChange);

    fireEvent.keyDown(screen.getByText('탈퇴할까요?'), { key: 'Escape' });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  // 호출처가 넘긴 핸들러를 그대로 이어 부르지 않으면, 자체 가드를 이미 가진 다이얼로그 20여 곳의
  // preventDefault 가 조용히 죽는다 — 공용화의 안전망이라 이 축을 직접 고정한다.
  it('호출처가 넘긴 닫기 핸들러를 그대로 이어 부른다', async () => {
    const onEscapeKeyDown = vi.fn();
    const onPointerDownOutside = vi.fn();
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent
          onEscapeKeyDown={onEscapeKeyDown}
          onPointerDownOutside={onPointerDownOutside}
          aria-describedby={undefined}
        >
          <DialogTitle>탈퇴할까요?</DialogTitle>
        </DialogContent>
      </Dialog>,
    );
    await flushOutsideListener();

    fireEvent.keyDown(screen.getByText('탈퇴할까요?'), { key: 'Escape' });
    fireEvent.pointerDown(document.body);

    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1);
    expect(onPointerDownOutside).toHaveBeenCalledTimes(1);
  });
});
