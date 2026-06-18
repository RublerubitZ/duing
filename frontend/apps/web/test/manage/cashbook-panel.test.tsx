import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CashbookEntry } from '@duing/types';

const mockUseEntries = vi.fn();
const mockUseSummary = vi.fn();
vi.mock('@duing/hooks', () => ({
  useCashbookEntriesQuery: (clubId: number, params: unknown) => mockUseEntries(clubId, params),
  useCashbookSummaryQuery: (clubId: number, params: unknown) => mockUseSummary(clubId, params),
  useDeleteCashbookEntryMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/app/_components/toast/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { CashbookPanel } from '@/app/manage/clubs/[clubId]/fees/_components/CashbookPanel';

const buildEntry = (over: Partial<CashbookEntry> = {}): CashbookEntry => ({
  id: 1, entryType: 'EXPENSE', source: 'BANK_API', categoryCode: 'OTHER', customCategory: null,
  amount: 30000, description: '출금', transactionDate: '2026-09-03', memo: null,
  attachmentUrl: null, bankTransactionId: 9, createdAt: '2026-09-03T00:00:00', ...over,
});
const buildPage = (content: CashbookEntry[]) => ({
  content, page: 0, size: 20, totalElements: content.length, totalPages: 1, hasNext: false,
});

beforeEach(() => {
  mockUseEntries.mockReset();
  mockUseSummary.mockReset();
});

describe('금전출납부 패널', () => {
  it('요약(장부 잔액)과 자동 항목 배지를 표시한다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry()]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 1200000, totalExpense: 700000, bookBalance: 500000 } });
    render(<CashbookPanel clubId={1} />);
    expect(screen.getByText('장부 잔액')).toBeInTheDocument();
    expect(screen.getByText('자동')).toBeInTheDocument();
  });

  it('BANK 자동 항목에는 삭제 버튼이 없다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry()]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 30000, bookBalance: -30000 } });
    render(<CashbookPanel clubId={1} />);
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });
});
