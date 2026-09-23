import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
let mockCreateError: Error | null = null;
let mockCreatePending = false;
vi.mock('@duing/hooks', () => ({
  useCreateCashbookEntryMutation: () => ({ mutate: mockCreateMutate, isPending: mockCreatePending, error: mockCreateError }),
  useUpdateCashbookEntryMutation: () => ({ mutate: mockUpdateMutate, isPending: false, error: null }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);
vi.mock('@duing/api', () => ({
  ApiError: class extends Error {
    constructor(_status: number, message: string) {
      super(message);
    }
  },
}));

import { ApiError } from '@duing/api';
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
  mockCreateError = null;
  mockCreatePending = false;
});

describe('금전출납부 등록 다이얼로그', () => {
  it('등록 실패 문구는 role="alert" 로 노출되어 스크린리더가 읽는다', () => {
    mockCreateError = new ApiError(400, '등록에 실패했습니다.');
    render(<CashbookEntryDialog clubId={1} entryType="EXPENSE" onClose={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('등록에 실패했습니다.');
  });

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

  it('설명이 비면 검증 오류를 설명 입력에 연결하고 등록하지 않는다', async () => {
    const user = userEvent.setup();
    render(<CashbookEntryDialog clubId={1} entryType="EXPENSE" onClose={vi.fn()} />);

    await user.type(screen.getByLabelText('금액(원)'), '30000');
    await user.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByText('설명은 필수입니다.')).toBeInTheDocument();
    expect(screen.getByLabelText('설명')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('설명')).toHaveAccessibleDescription('설명은 필수입니다.');
    expect(mockCreateMutate).not.toHaveBeenCalled();
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

  // 스피너 svg 는 aria-hidden 이라, 전송 중 통지는 버튼 밖 sr-only role="status" 리전이 맡는다(#914).
  it('등록 요청이 진행 중이면 보조기술에 "장부 항목 저장 중" 상태를 알린다', () => {
    mockCreatePending = true;
    render(<CashbookEntryDialog clubId={1} entryType="EXPENSE" onClose={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('장부 항목 저장 중');
  });
});
