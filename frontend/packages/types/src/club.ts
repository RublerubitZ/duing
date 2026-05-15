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

export interface ClubSummary {
  id: number;
  name: string;
  category: ClubCategory;
  division: string | null;
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
}

export interface ClubSnsLink {
  platform: string;
  url: string;
}

export interface ClubFaq {
  question: string;
  answer: string;
  order: number;
}

export interface ClubPhoto {
  id: number;
  storageKey: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  displayOrder: number;
}

export interface ClubDetail extends ClubSummary {
  description: string | null;
  coverUrl: string | null;
  snsLinks: ClubSnsLink[];
  faqs: ClubFaq[];
  leaderId: number | null;
  leaderName: string | null;
  photos: ClubPhoto[];
}

export interface ClubSearchParams {
  category?: ClubCategory;
  division?: string;
  keyword?: string;
  tags?: string[];
  recruiting?: boolean;
  page?: number;
  size?: number;
  sort?: string;
}

export interface CreateClubPayload {
  name: string;
  category: ClubCategory;
  division?: string;
  description?: string;
  logoUrl?: string;
  leaderId: number;
}

export interface UpdateClubStatusPayload {
  status: ClubStatus;
}