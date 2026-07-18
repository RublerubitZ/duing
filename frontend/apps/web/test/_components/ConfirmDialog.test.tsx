import { render, screen, fireEvent } from '@testing-library/react';
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
});
