import type { NoticeContentFormat } from './notice';

export type CreateClubNoticePayload = {
  title: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  pinned?: boolean;
  expiresAt?: string;
};

export type UpdateClubNoticePayload = Partial<CreateClubNoticePayload> & {
  clearCoverImage?: boolean;
};

export type ClubNoticeDetail = {
  id: number;
  title: string;
  summary: string;
  content: string;
  // 본문 렌더 방식 구분 — 리치 에디터(Tiptap) 공지는 'HTML', 레거시 평문 공지는 'MARKDOWN'.
  contentFormat: NoticeContentFormat;
  coverImageUrl: string;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};
