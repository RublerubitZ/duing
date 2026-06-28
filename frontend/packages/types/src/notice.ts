export type NoticeCategory = 'FESTIVAL' | 'FAIR' | 'FUNDING' | 'CONTEST' | 'GENERAL';

export type NoticeVisibility = 'PUBLIC' | 'OFFICERS_ALL' | 'CLUB_SCOPED';

export type NoticeClubScopeRole = 'OFFICERS_ONLY' | 'ALL_MEMBERS';

export type NoticeContentFormat = 'MARKDOWN' | 'HTML';

// 공지 출처 필터 — SCHOOL: 학교(관리자) 작성, CLUB: 가입 동아리가 작성한 공지.
export type NoticeSource = 'SCHOOL' | 'CLUB';

export type NoticeEventInfo = {
  startAt: string;
  endAt: string | null;
  location: string | null;
  host: string | null;
  audience: string | null;
};

export type NoticeCardItem = {
  id: number;
  title: string;
  summary: string;
  coverImageUrl: string;
  linkUrl: string | null;
  category: NoticeCategory;
  tags: string[];
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  // 출처 — 동아리 작성 공지면 채워지고(clubName 은 폐쇄 동아리 시 null 가능), 학교 공지면 둘 다 null.
  owningClubId: number | null;
  clubName: string | null;
};

export type NoticeDetail = {
  id: number;
  title: string;
  summary: string;
  content: string;
  coverImageUrl: string;
  linkUrl: string | null;
  category: NoticeCategory;
  tags: string[];
  visibility: NoticeVisibility | null;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[] | null;
  notifyOnPublish: boolean;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  contentFormat: NoticeContentFormat;
  owningClubId: number | null;
  clubName: string | null;
  eventInfo: NoticeEventInfo | null;
};

export type AdminNoticeSummary = {
  id: number;
  title: string;
  category: NoticeCategory;
  visibility: NoticeVisibility;
  pinned: boolean;
  notifyOnPublish: boolean;
  expiresAt: string | null;
  createdAt: string;
};

export type CreateNoticePayload = {
  title: string;
  summary: string;
  content: string;
  coverImageUrl: string;
  linkUrl: string | null;
  category: NoticeCategory;
  tags: string[];
  visibility: NoticeVisibility;
  clubScopeRole: NoticeClubScopeRole | null;
  targetClubIds: number[];
  pinned: boolean;
  expiresAt: string | null;
  notifyOnPublish: boolean;
  eventStartAt: string | null;
  eventEndAt: string | null;
  location: string | null;
  host: string | null;
  audience: string | null;
  contentFormat: NoticeContentFormat;
};

export type UpdateNoticePayload = Partial<Omit<CreateNoticePayload, 'targetClubIds'>> & {
  targetClubIds?: number[];
  clearExpiresAt?: boolean;
  clearEvent?: boolean;
  clearExternalLink?: boolean;
};
