import type { BillSearchParams, FeeSummaryParams, MyFeeSearchParams } from '@duing/types';

export const feeQueryKeys = {
  all: ['fees'] as const,
  policies: (clubId: number) => [...feeQueryKeys.all, 'policies', clubId] as const,
  // 동아리별 청구 목록의 무효화 prefix(필터 무관하게 전부 무효화하기 위함).
  billsByClub: (clubId: number) => [...feeQueryKeys.all, 'bills', clubId] as const,
  bills: (clubId: number, params: BillSearchParams) =>
    [...feeQueryKeys.billsByClub(clubId), params] as const,
  // 청구별 납부 내역.
  billPayments: (clubId: number, billId: number) =>
    [...feeQueryKeys.all, 'payments', clubId, billId] as const,
  // 동아리 수납 현황 집계의 무효화 prefix.
  summaryByClub: (clubId: number) => [...feeQueryKeys.all, 'summary', clubId] as const,
  summary: (clubId: number, params: FeeSummaryParams) =>
    [...feeQueryKeys.summaryByClub(clubId), params] as const,
  myFees: (params: MyFeeSearchParams) => [...feeQueryKeys.all, 'my', params] as const,
  // 동아리별 회비 계좌의 무효화 prefix — 운영진/동아리원 조회를 한 번에 무효화한다.
  accountByClub: (clubId: number) => [...feeQueryKeys.all, 'account', clubId] as const,
  // 운영진(편집용) 계좌 조회.
  account: (clubId: number) => [...feeQueryKeys.accountByClub(clubId), 'leader'] as const,
  // 동아리원(입금용) 계좌 조회.
  memberAccount: (clubId: number) => [...feeQueryKeys.accountByClub(clubId), 'member'] as const,
};
