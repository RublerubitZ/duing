import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelectAllBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/SelectAllBar';

describe('전체 선택 바', () => {
  it('미선택이면 선택 가능 인원을 먼저 알려준다', () => {
    render(<SelectAllBar selectableCount={14} selectedCount={0} state="none" onToggleAll={vi.fn()} />);
    expect(screen.getByText('전체 선택 (14명 선택 가능)')).toBeInTheDocument();
  });

  it('부분 선택이면 진행 상황을 보여주고 indeterminate 다', () => {
    render(<SelectAllBar selectableCount={14} selectedCount={7} state="partial" onToggleAll={vi.fn()} />);
    expect(screen.getByText('전체 선택 (7/14)')).toBeInTheDocument();
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: '전체 선택' }).indeterminate,
    ).toBe(true);
  });

  it('전체 선택이면 선택 인원을 보여준다', () => {
    render(<SelectAllBar selectableCount={14} selectedCount={14} state="all" onToggleAll={vi.fn()} />);
    expect(screen.getByText('전체 선택 (14명)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeChecked();
  });

  it('선택 가능 인원이 0명이면 비활성이다', () => {
    render(<SelectAllBar selectableCount={0} selectedCount={0} state="none" onToggleAll={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: '전체 선택' })).toBeDisabled();
  });

  it('누르면 onToggleAll 이 불린다', () => {
    const onToggleAll = vi.fn();
    render(<SelectAllBar selectableCount={14} selectedCount={0} state="none" onToggleAll={onToggleAll} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '전체 선택' }));
    expect(onToggleAll).toHaveBeenCalledTimes(1);
  });
});
