import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApplicantSlotItem } from '@/components/interview/ApplicantSlotItem';

describe('ApplicantSlotItem', () => {
  const slot = {
    slotId: 1,
    startTime: '2026-06-18T18:00:00',
    endTime: '2026-06-18T18:30:00',
    capacity: 2,
  };

  it('selected=true 면 aria-pressed=true 가 적용된다', () => {
    render(<ApplicantSlotItem slot={slot} selected onToggle={() => {}} />);
    const button = screen.getByRole('button', { pressed: true });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('chip 클릭 시 onToggle 이 slotId 로 호출된다', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ApplicantSlotItem slot={slot} selected={false} onToggle={onToggle} />);
    await user.click(screen.getByRole('button', { pressed: false }));
    expect(onToggle).toHaveBeenCalledWith(1);
  });

  it('disabled=true 시 onToggle 이 호출되지 않는다', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<ApplicantSlotItem slot={slot} selected={false} onToggle={onToggle} disabled />);
    const button = screen.getByRole('button', { pressed: false });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('시간 라벨이 HH:MM 형식으로 표시된다', () => {
    render(<ApplicantSlotItem slot={slot} selected={false} onToggle={() => {}} />);
    expect(screen.getByRole('button', { pressed: false })).toHaveTextContent('18:00 ~ 18:30');
  });
});
