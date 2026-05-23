import type { StudentRecruitmentProjection } from './recruitment';

export type ClubCategory =
  | 'ACADEMIC'
  | 'CULTURE'
  | 'ART'
  | 'SPORTS'
  | 'VOLUNTEER'
  | 'RELIGION'
  | 'HOBBY'
  | 'OTHER';

export type ClubStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'INACTIVE' | 'REJECTED';

export type ClubDayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type ClubSummary = {
  id: number;
  name: string;
  category: ClubCategory;
  division: string | null;
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
  centralClub: boolean;
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
  foundedYear: number | null;
  cohortNumber: number | null;
  location: string | null;
  contactEmail: string | null;
  activityFrequency: number | null;
  activeDays: ClubDayOfWeek[];
  membershipFee: string | null;
  tagline: string | null;
  highlights: string[];
  majorProjects: string | null;
  activeRecruitment: StudentRecruitmentProjection | null;
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
  centralClub?: boolean;
};

export type UpdateClubStatusPayload = {
  status: ClubStatus;
  rejectionReason?: string;
};

export type UpdateClubCentralClubPayload = {
  centralClub: boolean;
};

export type ClubRole = 'LEADER' | 'OFFICER';

export type ManagedClub = {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  myRole: ClubRole;
  activeRecruitmentCount: number;
};

export type UpdateClubPayload = {
  name?: string;
  category?: ClubCategory;
  division?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  tags?: string[];
  snsLinks?: ClubSnsLink[];
  faqs?: ClubFaq[];
  foundedYear?: number | null;
  cohortNumber?: number | null;
  location?: string | null;
  contactEmail?: string | null;
  activityFrequency?: number | null;
  activeDays?: ClubDayOfWeek[];
  membershipFee?: string | null;
  tagline?: string | null;
  highlights?: string[];
  majorProjects?: string | null;
};

export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO' | 'NOTICE_COVER' | 'PROMOTION_BANNER';

export type FileUploadResult = {
  storageKey: string;
  url: string;
};

export type CreateClubPhotoPayload = {
  storageKey: string;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
};

export type UpdateClubPhotoPayload = {
  caption?: string | null;
};

export type PhotoOrderItem = {
  photoId: number;
  displayOrder: number;
};

export type ReorderClubPhotosPayload = {
  items: PhotoOrderItem[];
};
