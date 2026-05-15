export type ClubCategory =
  | 'ACADEMIC'
  | 'CULTURE'
  | 'ART'
  | 'SPORTS'
  | 'VOLUNTEER'
  | 'RELIGION'
  | 'HOBBY'
  | 'OTHER';

export type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE';

export type ClubSummary = {
  id: number;
  name: string;
  category: ClubCategory;
  division: string | null;
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
};

export type ClubSnsLink = {
  platform: string;
  url: string;
};

export type ClubFaq = {
  question: string;
  answer: string;
  order: number;
};

export type ClubPhoto = {
  id: number;
  storageKey: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  displayOrder: number;
};

export type ClubDetail = ClubSummary & {
  description: string | null;
  coverUrl: string | null;
  snsLinks: ClubSnsLink[];
  faqs: ClubFaq[];
  leaderId: number | null;
  leaderName: string | null;
  photos: ClubPhoto[];
};

export type ClubSearchParams = {
  category?: ClubCategory;
  division?: string;
  keyword?: string;
  tags?: string[];
  recruiting?: boolean;
  page?: number;
  size?: number;
  sort?: string;
};

export type CreateClubPayload = {
  name: string;
  category: ClubCategory;
  division?: string;
  description?: string;
  logoUrl?: string;
  leaderId: number;
};

export type UpdateClubStatusPayload = {
  status: ClubStatus;
};