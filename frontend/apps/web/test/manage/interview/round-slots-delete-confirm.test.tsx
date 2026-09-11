import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { InterviewRoundDetail } from '@duing/types';

const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock('@duing/hooks', () => ({
  useCreateRoundSlotsMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteRoundSlotMutation: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
  useUpdateRoundSlotMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock('@/components/interview/SlotPatternForm', () => ({ SlotPatternForm: () => null }));

import { RoundSlotsSection } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/rounds/[roundId]/_components/RoundSlotsSection';

const detail = {
  roundId: 1,
  status: 'DRAFT',
  slots: [{ slotId: 11, startTime: '2026-10-01T10:00:00', endTime: '2026-10-01T10:30:00', capacity: 2, assignedCount: 0, selectedCount: 0 }],
} as unknown as InterviewRoundDetail;

describe('RoundSlotsSection 슬롯 삭제 확인', () => {
  it('취소하면 삭제 요청이 나가지 않고, 확인하면 나간다', async () => {
    const user = userEvent.setup();
    render(<RoundSlotsSection detail={detail} onSlotsCreated={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: /슬롯 삭제$/ }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(deleteMutateAsync).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /슬롯 삭제$/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }));
    expect(deleteMutateAsync).toHaveBeenCalledWith(11);
  });
});
