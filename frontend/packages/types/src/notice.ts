export type NoticeCategory = 'FESTIVAL' | 'FAIR' | 'FUNDING' | 'CONTEST' | 'GENERAL';

export type NoticeVisibility = 'PUBLIC' | 'OFFICERS_ALL' | 'CLUB_SCOPED';

export type NoticeClubScopeRole = 'OFFICERS_ONLY' | 'ALL_MEMBERS';

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
};