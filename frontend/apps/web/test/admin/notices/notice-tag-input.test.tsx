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

  it('예전에 # 를 붙여 저장한 태그와 같은 태그는 넣지 않고 입력란을 비운다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={['#학사']} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '학사' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue('');
  });
});

describe('NoticeTagInput (칩 표시)', () => {
  it('예전에 # 를 붙여 저장한 태그도 칩에 # 하나로 보여준다', () => {
    render(<NoticeTagInput value={['#학사']} onChange={vi.fn()} />);

    expect(screen.getByText(/^#학사/)).toBeInTheDocument();
    expect(screen.queryByText(/##학사/)).toBeNull();
    expect(screen.getByRole('button', { name: '학사 태그 제거' })).toBeInTheDocument();
  });
});

// 쉼표는 태그 필터의 구분자라 태그에 넣지 않는다(#1338) — 공지 태그는 Enter·추가 때 쉼표로 나눠 넣는다.
describe('NoticeTagInput (쉼표 구분)', () => {
  it('입력 중에는 나누지 않고 Enter 때 쉼표로 나눠 여러 태그를 한 번에 넣는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '학사, 장학,학사' } });
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(['학사', '장학']);
    expect(input).toHaveValue('');
  });

  it('추가 버튼도 쉼표로 나눠 넣는다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    fireEvent.change(screen.getByPlaceholderText(/태그 입력 후 Enter/), { target: { value: '학사,장학' } });
    fireEvent.click(screen.getByRole('button', { name: '추가' }));

    expect(onChange).toHaveBeenCalledWith(['학사', '장학']);
  });

  it('넣지 못한 조각(20자 초과·8개 한도)은 지우지 않고 입력란에 남긴다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={['a', 'b', 'c', 'd', 'e', 'f', 'g']} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    const tooLong = '가'.repeat(21);
    fireEvent.change(input, { target: { value: `학사,${tooLong},장학` } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c', 'd', 'e', 'f', 'g', '학사']);
    expect(input).toHaveValue(`${tooLong}, 장학`);
  });

  it('붙여넣은 탭 같은 제어문자는 지운다 — 서버 정규화와 같아 저장 뒤에도 칩이 그대로다', () => {
    const onChange = vi.fn();
    render(<NoticeTagInput value={[]} onChange={onChange} />);

    const input = screen.getByPlaceholderText(/태그 입력 후 Enter/);
    fireEvent.change(input, { target: { value: '학사\t장학' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledWith(['학사장학']);
  });
});
