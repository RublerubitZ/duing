import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NoticeTagInput } from '../../../app/admin/notices/_components/NoticeTagInput';

describe('NoticeTagInput', () => {
  it('IME 조합 중(Enter, isComposing)에는 태그가 추가되지 않는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('조합이 끝난 Enter 로는 태그가 한 번만 추가된다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['안녕']);
  });

  it('중복 태그는 추가되지 않는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={['안녕']} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
  });
});
