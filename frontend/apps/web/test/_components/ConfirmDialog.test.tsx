import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../../app/_components/ConfirmDialog';

describe('ConfirmDialog', () => {
  it('open=false 면 아무것도 렌더하지 않는다', () => {
    render(
      <ConfirmDialog open={false} title="삭제할까요?" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.queryByText('삭제할까요?')).toBeNull();
  });

  it('open 이면 제목·설명·기본 버튼을 렌더한다', () => {
    render(
      <ConfirmDialog
        open
        title="공지를 삭제할까요?"
        description="더 이상 노출되지 않습니다."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('공지를 삭제할까요?')).toBeInTheDocument();
    expect(screen.getByText('더 이상 노출되지 않습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });

  it('삭제 버튼을 누르면 onConfirm, 취소 버튼을 누르면 onCancel 이 호출된다', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="삭제할까요?" onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('isPending 이면 버튼이 비활성화되고 라벨은 유지되며 클릭이 무시된다', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="삭제할까요?"
        isPending
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const confirmButton = screen.getByRole('button', { name: '삭제' });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();
    fireEvent.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('errorMessage 를 넘기지 않으면 오류 노드를 만들지 않는다', () => {
    // 아직 전환하지 않은 소비처는 이 prop 을 넘기지 않는다 — DOM 이 그대로여야 무영향이다.
    render(<ConfirmDialog open title="삭제할까요?" onConfirm={() => {}} onCancel={() => {}} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('errorMessage 를 넘기면 모달 안에 알림으로 표시한다', () => {
    render(
      <ConfirmDialog
        open
        title="삭제할까요?"
        errorMessage="권한이 없습니다."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    const alert = within(screen.getByRole('dialog')).getByRole('alert');
    expect(alert).toHaveTextContent('권한이 없습니다.');
    // 모달 서브트리 안이라 포커스 트랩 범위에 있고 접근성 트리에서도 숨겨지지 않는다.
    expect(alert.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('오류가 떠 있어도 탭 순서는 취소 → 확인 그대로다', async () => {
    // 오류 문구가 포커스를 가로채면 키보드 사용자가 재시도에 도달하지 못한다.
    render(
      <ConfirmDialog
        open
        title="삭제할까요?"
        errorMessage="권한이 없습니다."
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );

    // 포커스는 안전한 쪽(취소)에서 시작하고, 한 번 Tab 하면 확인에 닿는다.
    // 오류 노드가 포커스를 받게 되면 이 순서가 어긋난다.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }));
    await userEvent.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '삭제' }));
  });
});
