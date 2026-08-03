import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';

import { ConfirmDialog } from '@/app/_components/ConfirmDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="정말 삭제할까요?"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  it('errorMessage 를 넘기지 않으면 오류 노드를 만들지 않는다', () => {
    // 기존 소비처 열세 곳은 이 prop 을 넘기지 않는다 — DOM 이 그대로여야 무영향이다.
    renderDialog();

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeEnabled();
  });

  it('errorMessage 를 넘기면 모달 안에 알림으로 표시한다', () => {
    renderDialog({ errorMessage: '권한이 없습니다.' });

    const dialog = screen.getByRole('dialog');
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('권한이 없습니다.');
    // 모달 서브트리 안이라 포커스 트랩 범위에 있고, 접근성 트리에서도 숨겨지지 않는다.
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('오류가 있어도 확인·취소를 다시 누를 수 있다', async () => {
    const { onConfirm, onCancel } = renderDialog({ errorMessage: '일시적인 오류입니다.' });

    await userEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('처리 중에는 오류 표시와 무관하게 두 버튼이 모두 잠긴다', () => {
    renderDialog({ errorMessage: '이전 시도 실패', isPending: true });

    expect(screen.getByRole('button', { name: '삭제' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
  });

  it('오류가 떠 있어도 키보드만으로 확인 버튼에 도달해 재시도할 수 있다', async () => {
    const { onConfirm } = renderDialog({ errorMessage: '권한이 없습니다.' });
    const confirmButton = screen.getByRole('button', { name: '삭제' });

    // 오류 문구는 포커스를 가로채지 않는다 — 몇 번 Tab 하면 확인 버튼에 닿아야 한다.
    for (let i = 0; i < 6 && document.activeElement !== confirmButton; i += 1) {
      await userEvent.tab();
    }

    expect(document.activeElement).toBe(confirmButton);
    await userEvent.keyboard('{Enter}');
    expect(onConfirm).toHaveBeenCalled();
  });
});
