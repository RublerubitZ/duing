import { render, screen, fireEvent } from '@testing-library/react';
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

  // 바깥 클릭 경로는 여기서 검증하지 않는다 — jsdom 에서는 Radix 의 바깥 감지가 발화하지 않아
  // (음성 대조로 확인: 가드를 꺼도 닫히지 않는다) 무엇을 넣어도 통과하는 공허한 단언이 된다.
  // ESC 와 같은 한 줄 가드를 공유하므로 코드 경로는 동일하고, 실동작은 실브라우저 확인이 필요하다.

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
});
