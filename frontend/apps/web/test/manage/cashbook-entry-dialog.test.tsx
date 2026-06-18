import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useCreateCashbookEntryMutation: () => ({ mutate: mockCreateMutate, isPending: false, error: null }),
  useUpdateCashbookEntryMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));
vi.mock('@duing/api', () => ({ ApiError: class extends Error {} }));

import { CashbookEntryDialog } from '@/app/manage/clubs/[clubId]/fees/_components/CashbookEntryDialog';

beforeEach(() => mockCreateMutate.mockReset());

describe('금전출납부 등록 다이얼로그', () => {
  it('지출을 등록하면 payload 에 유형·카테고리·금액이 실린다', async () => {
    const user = userEvent.setup();
    mockCreateMutate.mockImplementation((_p: unknown, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.(),
    );
    render(<CashbookEntryDialog clubId={1} entryType="EXPENSE" onClose={vi.fn()} />);

    await user.clear(screen.getByLabelText('금액(원)'));
    await user.type(screen.getByLabelText('금액(원)'), '30000');
    await user.type(screen.getByLabelText('설명'), 'MT 버스비');
    await user.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
    expect(mockCreateMutate.mock.calls[0]?.[0]).toMatchObject({
      entryType: 'EXPENSE',
      categoryCode: 'MT',
      amount: 30000,
      description: 'MT 버스비',
    });
  });

  it('카테고리가 기타일 때만 직접입력이 보인다', async () => {
    const user = userEvent.setup();
    render(<CashbookEntryDialog clubId={1} entryType="EXPENSE" onClose={vi.fn()} />);
    expect(screen.queryByLabelText('직접입력')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('카테고리'), 'OTHER');
    expect(screen.getByLabelText('직접입력')).toBeInTheDocument();
  });
});
