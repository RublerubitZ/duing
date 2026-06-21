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
