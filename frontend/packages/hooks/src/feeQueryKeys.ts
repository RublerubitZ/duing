import type { BillSearchParams, MyFeeSearchParams } from '@duing/types';

export const feeQueryKeys = {
  all: ['fees'] as const,
  policies: (clubId: number) => [...feeQueryKeys.all, 'policies', clubId] as const,
  // 동아리별 청구 목록의 무효화 prefix(필터 무관하게 전부 무효화하기 위함).
  billsByClub: (clubId: number) => [...feeQueryKeys.all, 'bills', clubId] as const,
  bills: (clubId: number, params: BillSearchParams) =>
    [...feeQueryKeys.billsByClub(clubId), params] as const,
  myFees: (params: MyFeeSearchParams) => [...feeQueryKeys.all, 'my', params] as const,
};
