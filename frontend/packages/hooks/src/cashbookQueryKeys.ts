import type { CashbookSearchParams } from '@duing/types';

export const cashbookQueryKeys = {
  all: ['cashbook'] as const,
  byClub: (clubId: number) => [...cashbookQueryKeys.all, clubId] as const,
  list: (clubId: number, params: CashbookSearchParams) =>
    [...cashbookQueryKeys.byClub(clubId), 'list', params] as const,
  summary: (clubId: number, params: CashbookSearchParams) =>
    [...cashbookQueryKeys.byClub(clubId), 'summary', params] as const,
};
