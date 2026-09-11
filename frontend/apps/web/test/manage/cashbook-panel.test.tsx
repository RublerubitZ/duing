import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { CashbookEntry } from '@duing/types';

const mockUseEntries = vi.fn();
const mockUseSummary = vi.fn();
const mockToggleMutate = vi.fn();
const mockDeleteMutate = vi.fn();
vi.mock('@duing/hooks', () => ({
  useCashbookEntriesQuery: (clubId: number, params: unknown) => mockUseEntries(clubId, params),
  useCashbookSummaryQuery: (clubId: number, params: unknown) => mockUseSummary(clubId, params),
  useDeleteCashbookEntryMutation: () => ({ mutate: mockDeleteMutate, isPending: false }),
  useToggleCashbookExclusionMutation: () => ({ mutate: mockToggleMutate, isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@/app/_components/toast/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

import { CashbookPanel } from '@/app/manage/clubs/[clubId]/fees/_components/CashbookPanel';

const buildEntry = (over: Partial<CashbookEntry> = {}): CashbookEntry => ({
  id: 1, entryType: 'EXPENSE', source: 'BANK_API', categoryCode: 'OTHER', customCategory: null,
  amount: 30000, description: '출금', transactionDate: '2026-09-03', memo: null,
  attachmentUrl: null, bankTransactionId: 9, excluded: false, createdAt: '2026-09-03T00:00:00', ...over,
});
const buildPage = (content: CashbookEntry[]) => ({
  content, page: 0, size: 20, totalElements: content.length, totalPages: 1, hasNext: false,
});

beforeEach(() => {
  mockUseEntries.mockReset();
  mockUseSummary.mockReset();
  mockToggleMutate.mockReset();
  mockDeleteMutate.mockReset();
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

  it('카테고리 필터를 바꾸면 categoryCode 가 params 에 실린다', async () => {
    const user = userEvent.setup();
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry()]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 30000, bookBalance: -30000 } });
    render(<CashbookPanel clubId={1} />);

    await user.selectOptions(screen.getByLabelText('카테고리 필터'), 'DINING');

    await waitFor(() =>
      expect(mockUseEntries).toHaveBeenLastCalledWith(1, expect.objectContaining({ categoryCode: 'DINING' })),
    );
  });

  it('제외된 항목은 "제외됨" 배지로 표시된다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry({ excluded: true })]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 0, bookBalance: 0 } });
    render(<CashbookPanel clubId={1} />);
    expect(screen.getByText('제외됨')).toBeInTheDocument();
  });

  it('제외 버튼이 토글 mutation 을 호출한다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry({ excluded: false })]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 30000, bookBalance: -30000 } });
    render(<CashbookPanel clubId={1} />);
    fireEvent.click(screen.getByRole('button', { name: '제외' }));
    expect(mockToggleMutate).toHaveBeenCalledWith(
      { entryId: 1, excluded: true },
      expect.anything(),
    );
  });

  // 장부 삭제는 되돌릴 수 없다 — 누른 즉시 mutation 이 나가지 않고 확인 모달을 한 단계 거친다.
  it('수동 항목 삭제는 확인 다이얼로그를 거친다', async () => {
    const user = userEvent.setup();
    mockUseEntries.mockReturnValue({ data: buildPage([buildEntry({ source: 'MANUAL' })]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 30000, bookBalance: -30000 } });
    render(<CashbookPanel clubId={1} />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
    // 무엇을 지우는지 다이얼로그에 남는다 — 금액·내역이 안내에 있어야 한다.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/−30,000원 · 출금/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));
    expect(mockDeleteMutate).toHaveBeenCalledWith(expect.any(Number), expect.anything());
  });

  it('"제외 항목 숨기기" 토글이 hideExcluded 파라미터를 연결한다', () => {
    mockUseEntries.mockReturnValue({ data: buildPage([]), isLoading: false });
    mockUseSummary.mockReturnValue({ data: { totalIncome: 0, totalExpense: 0, bookBalance: 0 } });
    render(<CashbookPanel clubId={1} />);
    fireEvent.click(screen.getByRole('button', { name: '제외 항목 숨기기' }));
    const lastParams = mockUseEntries.mock.calls.at(-1)?.[1];
    expect(lastParams).toMatchObject({ hideExcluded: true });
  });
});
