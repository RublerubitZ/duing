import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Receipt } from '@duing/types';

const mockUseMyFeeReceiptQuery = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  // 날짜 유틸(formatDateKst 등) 순수 함수는 실제 구현을 그대로 쓴다.
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useMyFeeReceiptQuery: (billId: number) => mockUseMyFeeReceiptQuery(billId),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ({ billId: '100' }),
}));

import MemberReceiptPage from '@/app/me/fees/[billId]/receipt/page';

const buildReceipt = (over: Partial<Receipt> = {}): Receipt => ({
  receiptNumber: 'RCP-202607-100',
  clubName: '동아리A',
  memberName: '김회원',
  policyName: '월 회비',
  billingPeriod: '2026-07',
  billingStartDate: '2026-07-01',
  billingEndDate: '2026-07-31',
  dueDate: '2026-07-31',
  amount: 10000,
  paidTotal: 7000,
  remaining: 3000,
  paymentCount: 2,
  status: 'PARTIAL_PAID',
  issuedAt: '2026-07-15T00:00:00',
  payments: [
    { amount: 4000, method: 'CASH', paidAt: '2026-07-10T00:00:00', memo: null },
    { amount: 3000, method: 'TRANSFER', paidAt: '2026-07-12T00:00:00', memo: '이체' },
  ],
  ...over,
});

beforeEach(() => {
  mockUseMyFeeReceiptQuery.mockReset();
});

describe('회원 영수증 페이지', () => {
  it('영수증 번호와 납부 합계를 표시한다', () => {
    mockUseMyFeeReceiptQuery.mockReturnValue({ data: buildReceipt(), isLoading: false, isError: false });
    render(<MemberReceiptPage />);
    expect(screen.getByText('RCP-202607-100')).toBeInTheDocument();
    expect(screen.getByText('회비 납부 영수증')).toBeInTheDocument();
  });

  it('인쇄 버튼이 window.print 를 호출한다', () => {
    mockUseMyFeeReceiptQuery.mockReturnValue({ data: buildReceipt(), isLoading: false, isError: false });
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<MemberReceiptPage />);
    fireEvent.click(screen.getByRole('button', { name: '인쇄 / PDF 저장' }));
    expect(printSpy).toHaveBeenCalledOnce();
    printSpy.mockRestore();
  });

  it('발급 불가(에러)면 안내 문구와 돌아가기 링크를 표시한다', () => {
    mockUseMyFeeReceiptQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<MemberReceiptPage />);
    expect(screen.getByText(/영수증을 불러올 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '돌아가기' })).toBeInTheDocument();
  });
});
