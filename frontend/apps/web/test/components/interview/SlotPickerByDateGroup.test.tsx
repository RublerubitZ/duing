import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApplicantInterviewSlot } from '@duing/types';
import { SlotPickerByDateGroup } from '@/components/interview/SlotPickerByDateGroup';

const SLOTS: ApplicantInterviewSlot[] = [
  { slotId: 1, startTime: '2026-06-18T18:00:00', endTime: '2026-06-18T18:30:00', capacity: 2 },
  { slotId: 2, startTime: '2026-06-18T18:30:00', endTime: '2026-06-18T19:00:00', capacity: 2 },
  { slotId: 3, startTime: '2026-06-19T10:00:00', endTime: '2026-06-19T10:30:00', capacity: 2 },
];

describe('SlotPickerByDateGroup', () => {
  it('날짜별로 그룹이 나뉘어 렌더된다', () => {
    render(
      <SlotPickerByDateGroup slots={SLOTS} selectedSlotIds={[]} onChange={() => {}} />,
    );
    // 18일 그룹: 슬롯 2개, 19일 그룹: 슬롯 1개
    const groupJun18 = screen.getByRole('group', { name: /6월 18일.*슬롯/ });
    expect(groupJun18.querySelectorAll('button[aria-pressed]')).toHaveLength(2);
    const groupJun19 = screen.getByRole('group', { name: /6월 19일.*슬롯/ });
    expect(groupJun19.querySelectorAll('button[aria-pressed]')).toHaveLength(1);
  });

  it('chip 클릭 시 onChange 가 토글된 배열로 호출된다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SlotPickerByDateGroup
        slots={SLOTS}
        selectedSlotIds={[1]}
        onChange={onChange}
      />,
    );
    // 이미 선택된 1 을 해제
    const pressedChip = screen.getByRole('button', { pressed: true });
    await user.click(pressedChip);
    expect(onChange).toHaveBeenLastCalledWith([]);
    onChange.mockClear();
    // 미선택 chip 들 중 첫 번째(slot 2) 를 선택
    const [firstUnpressed] = screen.getAllByRole('button', { pressed: false });
    if (!firstUnpressed) throw new Error('expected at least one unpressed chip');
    await user.click(firstUnpressed);
    expect(onChange).toHaveBeenLastCalledWith([1, 2]);
  });

  it('disabled=true 시 onChange 가 호출되지 않는다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SlotPickerByDateGroup
        slots={SLOTS}
        selectedSlotIds={[]}
        onChange={onChange}
        disabled
      />,
    );
    const [chip] = screen.getAllByRole('button', { pressed: false });
    if (!chip) throw new Error('expected at least one chip');
    await user.click(chip);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('minSelected=1 이고 0개 선택일 때 안내 문구가 보인다', () => {
    render(
      <SlotPickerByDateGroup
        slots={SLOTS}
        selectedSlotIds={[]}
        onChange={() => {}}
        minSelected={1}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/최소 1개 이상/);
  });

  it('minSelected 충족 시 "N개 선택됨" 으로 변한다', () => {
    render(
      <SlotPickerByDateGroup
        slots={SLOTS}
        selectedSlotIds={[1]}
        onChange={() => {}}
        minSelected={1}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('1개 선택됨');
  });
});
