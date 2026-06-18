// 금전출납부(cashbook) 도메인 타입 — 백엔드 cashbook 컨트롤러 DTO 와 1:1.

export type CashbookEntryType = 'INCOME' | 'EXPENSE';
export type CashbookSource = 'MANUAL' | 'BANK_API';
export type CashbookCategory =
  | 'FEE' | 'SPONSOR' | 'SUBSIDY'
  | 'MT' | 'DINING' | 'SNACK' | 'SUPPLY' | 'MARKETING'
  | 'OTHER';

// CashbookEntryResponse 미러. transactionDate=YYYY-MM-DD, createdAt=ISO 일시.
export type CashbookEntry = {
  id: number;
  entryType: CashbookEntryType;
  source: CashbookSource;
  categoryCode: CashbookCategory;
  customCategory: string | null;
  amount: number;
  description: string;
  transactionDate: string;
  memo: string | null;
  attachmentUrl: string | null;
  bankTransactionId: number | null;
  createdAt: string;
};

// CashbookSummaryResponse 미러. bookBalance = totalIncome - totalExpense(장부 잔액).
export type CashbookSummary = {
  totalIncome: number;
  totalExpense: number;
  bookBalance: number;
};

// GET /leader/clubs/{clubId}/cashbook(+summary) 의 동적 필터.
// keyword 는 백엔드 @RequestParam keyword 와 정합(description/memo/customCategory 부분일치).
export type CashbookSearchParams = {
  entryType?: CashbookEntryType;
  categoryCode?: CashbookCategory;
  from?: string;
  to?: string;
  keyword?: string;
  page?: number;
  size?: number;
};

// CreateCashbookEntryRequest 미러. source 는 서버가 MANUAL 강제(미포함).
export type CreateCashbookEntryPayload = {
  entryType: CashbookEntryType;
  categoryCode: CashbookCategory;
  customCategory?: string;
  amount: number;
  description: string;
  transactionDate: string;
  memo?: string;
};

// UpdateCashbookEntryRequest 미러(부분: BANK_API 는 카테고리·메모만, MANUAL 은 금액·설명·거래일 포함).
export type UpdateCashbookEntryPayload = {
  categoryCode: CashbookCategory;
  customCategory?: string;
  amount?: number;
  description?: string;
  transactionDate?: string;
  memo?: string;
};
