import { act, render, screen, fireEvent } from '@testing-library/react';
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

  it('IME 확정 keydown(keyCode 229)으로는 태그가 추가되지 않는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('조합 시작(compositionStart) 후 Enter 로는 태그가 추가되지 않는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '안녕' } });
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });

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

// 쉼표는 태그 필터의 구분자라 태그에 넣지 않는다(#1338).
describe('NoticeTagInput (쉼표 구분)', () => {
  it('값으로 들어온 쉼표 앞은 태그로 넣고 뒤만 입력란에 남긴다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '학사,장' } });

    expect(onChange).toHaveBeenCalledWith(['학사']);
    expect(input).toHaveValue('장');
  });

  it('조합 중에는 나누지 않고 조합이 끝날 때 나눈다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    act(() => input.focus());
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '학사,장' } });
    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('학사,장');

    fireEvent.compositionEnd(input);
    expect(onChange).toHaveBeenCalledWith(['학사']);
    expect(input).toHaveValue('장');
  });

  it('한 번에 들어온 여러 조각은 중복을 빼고 한 번에 넘긴다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/태그 입력 후 Enter/), { target: { value: '가,가,나' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['가']);
  });

  it('여러 조각이 들어와도 태그는 8개를 넘지 않는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={['a', 'b', 'c', 'd', 'e', 'f', 'g']} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/태그 입력 후 Enter/), { target: { value: '가,나,' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c', 'd', 'e', 'f', 'g', '가']);
  });

  it('조합이 끝나기 전에 추가 버튼이 눌려 쉼표가 남은 입력도 쉼표로 나눠 넣는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    act(() => input.focus());
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: '학사,장학' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(onChange).toHaveBeenCalledWith(['학사', '장학']);
  });
});
