import type { ClubEventListParams } from '@duing/types';

export const clubEventKeys = {
  all: ['club', 'events'] as const,
  byClub: (clubId: number) => [...clubEventKeys.all, clubId] as const,
  list: (clubId: number, params: ClubEventListParams) =>
    [...clubEventKeys.byClub(clubId), 'list', params] as const,
  detail: (clubId: number, eventId: number) =>
    [...clubEventKeys.byClub(clubId), 'detail', eventId] as const,
};
