import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HighlightsRepeater } from '../../app/manage/clubs/[clubId]/info/_components/HighlightsRepeater';

describe('HighlightsRepeater', () => {
  it('+ 항목 추가 버튼을 누르면 빈 항목이 onChange 로 전달된다', () => {
    const onChange = vi.fn();
    render(<HighlightsRepeater value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /항목 추가/ }));
    expect(onChange).toHaveBeenLastCalledWith(['']);
  });

  it('삭제 버튼을 누르면 해당 항목이 빠진 새 배열이 전달된다', () => {
    const onChange = vi.fn();
    render(<HighlightsRepeater value={['a', 'b']} onChange={onChange} />);

    const deleteButtons = screen.getAllByRole('button', { name: '강조 항목 삭제' });
    fireEvent.click(deleteButtons[0]!);
    expect(onChange).toHaveBeenLastCalledWith(['b']);
  });

  it('추가 제한(7)에 도달하면 추가 버튼이 비활성화된다', () => {
    render(<HighlightsRepeater value={['a', 'b', 'c', 'd', 'e', 'f', 'g']} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /항목 추가/ })).toBeDisabled();
  });
});
