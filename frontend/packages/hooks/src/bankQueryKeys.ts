import type { BankTransactionSearchParams } from '@duing/types';

export const bankQueryKeys = {
  all: ['bank'] as const,
  // 동아리별 검토 큐의 무효화 prefix(필터 무관하게 전부 무효화하기 위함).
  transactionsByClub: (clubId: number) => [...bankQueryKeys.all, 'transactions', clubId] as const,
  transactions: (clubId: number, params: BankTransactionSearchParams) =>
    [...bankQueryKeys.transactionsByClub(clubId), params] as const,
  // ADMIN BANK 자동매칭 관리 조회.
  adminOverview: () => [...bankQueryKeys.all, 'admin', 'overview'] as const,
};
