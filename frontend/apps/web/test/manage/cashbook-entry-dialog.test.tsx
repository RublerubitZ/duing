import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useCreateCashbookEntryMutation: () => ({ mutate: mockCreateMutate, isPending: false, error: null }),
  useUpdateCashbookEntryMutation: () => ({ mutate: mockUpdateMutate, isPending: false, error: null }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@duing/api', () => ({ ApiError: class extends Error {} }));

import type { CashbookEntry } from '@duing/types';

import { CashbookEntryDialog } from '@/app/manage/clubs/[clubId]/fees/_components/CashbookEntryDialog';

const buildEntry = (over: Partial<CashbookEntry> = {}): CashbookEntry => ({
  id: 7, entryType: 'EXPENSE', source: 'BANK_API', categoryCode: 'OTHER', customCategory: null,
  amount: 30000, description: '자동 출금', transactionDate: '2026-09-03', memo: null,
  attachmentUrl: null, bankTransactionId: 9, excluded: false, createdAt: '2026-09-03T00:00:00', ...over,
});

beforeEach(() => {
  mockCreateMutate.mockReset();
  mockUpdateMutate.mockReset();
});

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

  it('BANK_API 수정은 금액·설명·거래일을 잠그고 카테고리·메모만 제출한다', async () => {
    const user = userEvent.setup();
    mockUpdateMutate.mockImplementation((_p: unknown, options?: { onSuccess?: () => void }) =>
      options?.onSuccess?.(),
    );
    const bankEntry = buildEntry();
    render(<CashbookEntryDialog clubId={1} entryType={bankEntry.entryType} entry={bankEntry} onClose={vi.fn()} />);

    expect(screen.getByLabelText('금액(원)')).toBeDisabled();
    expect(screen.getByLabelText('설명')).toBeDisabled();
    expect(screen.getByLabelText('거래일')).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('카테고리'), 'DINING');
    await user.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(mockUpdateMutate).toHaveBeenCalled());
    const payload = mockUpdateMutate.mock.calls[0]?.[0]?.payload;
    expect(payload).toMatchObject({ categoryCode: 'DINING' });
    expect(payload).not.toHaveProperty('amount');
    expect(payload).not.toHaveProperty('description');
    expect(payload).not.toHaveProperty('transactionDate');
  });
});
