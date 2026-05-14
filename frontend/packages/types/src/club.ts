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
}

export interface ClubDetail extends ClubSummary {
  description: string | null;
  leaderId: number | null;
  leaderName: string | null;
}

export interface ClubSearchParams {
  category?: ClubCategory;
  division?: string;
  keyword?: string;
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
