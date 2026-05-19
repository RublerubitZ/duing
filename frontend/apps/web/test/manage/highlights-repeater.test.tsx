import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HighlightsRepeater } from '../../app/manage/clubs/[clubId]/info/_components/HighlightsRepeater';

describe('HighlightsRepeater', () => {
  it('+ 강조 항목 추가 버튼을 누르면 빈 항목이 onChange 로 전달된다', () => {
    const onChange = vi.fn();
    render(<HighlightsRepeater value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /강조 항목 추가/ }));
    expect(onChange).toHaveBeenLastCalledWith(['']);
  });

  it('삭제 버튼을 누르면 해당 항목이 빠진 새 배열이 전달된다', () => {
    const onChange = vi.fn();
    render(<HighlightsRepeater value={['a', 'b']} onChange={onChange} />);

    const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
    fireEvent.click(deleteButtons[0]!);
    expect(onChange).toHaveBeenLastCalledWith(['b']);
  });

  it('최대 개수에 도달하면 추가 버튼이 사라진다', () => {
    render(<HighlightsRepeater value={['a','b','c','d','e','f','g','h','i','j']} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /강조 항목 추가/ })).toBeNull();
  });
});
