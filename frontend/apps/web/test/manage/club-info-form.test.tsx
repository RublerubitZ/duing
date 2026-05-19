import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActiveDaysToggle } from '../../app/manage/clubs/[clubId]/info/_components/ActiveDaysToggle';

describe('ActiveDaysToggle', () => {
  it('요일 클릭 시 선택/해제가 토글된다', () => {
    const onChange = vi.fn();
    const { rerender } = render(<ActiveDaysToggle value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: '수' }));
    expect(onChange).toHaveBeenLastCalledWith(['WEDNESDAY']);

    rerender(<ActiveDaysToggle value={['WEDNESDAY']} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '수' }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('disabled=true 면 클릭이 무시된다', () => {
    const onChange = vi.fn();
    render(<ActiveDaysToggle value={[]} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole('button', { name: '월' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
