export const clubMembershipKeys = {
  all: ['club', 'membership'] as const,
  byClub: (clubId: number) => [...clubMembershipKeys.all, clubId] as const,
};

export const clubNoticeKeys = {
  all: ['club', 'notices'] as const,
  byClub: (clubId: number) => [...clubNoticeKeys.all, clubId] as const,
  list: (clubId: number, page: number, size: number) =>
    [...clubNoticeKeys.byClub(clubId), 'list', { page, size }] as const,
  detail: (clubId: number, noticeId: number) =>
    [...clubNoticeKeys.byClub(clubId), 'detail', noticeId] as const,
};
