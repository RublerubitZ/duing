import type { RecruitmentDisplayStatus, StudentRecruitmentProjection } from './recruitment';
import type { College } from './user';

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

/**
 * 카드 표시에 필요한 활성/대표 모집의 축약형.
 * BE: ClubSummaryResponse.ActiveRecruitmentSummaryResponse 와 1:1 매칭.
 */
export type ClubSummaryRecruitment = {
  recruitmentId: number;
  displayStatus: RecruitmentDisplayStatus;
  startDate: string;          // ISO yyyy-MM-dd
  endDate: string | null;     // null = 상시모집
};

export type ClubSummary = {
  id: number;
  name: string;
  category: ClubCategory;
  division: string | null;
  college: College | null;
  logoUrl: string | null;
  status: ClubStatus;
  tags: string[];
  centralClub: boolean;
  activeRecruitment: ClubSummaryRecruitment | null;
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
  /**
   * 상세 페이지 전용: 카드용 ClubSummaryRecruitment 보다 풍부한 필드를 노출.
   * field 명도 다르다 — 카드는 `recruitmentId`, 상세는 `id`. BE 응답 모양과 1:1 매칭이라 의도된 발산.
   */
  activeRecruitment: StudentRecruitmentProjection | null;
};

export type ClubSearchParams = {
  category?: ClubCategory;
  division?: string;
  keyword?: string;
  tags?: string[];
  recruiting?: boolean;                                              // deprecated
  recruitmentStatus?: 'AVAILABLE' | 'UPCOMING' | 'CLOSED';
  centralClub?: boolean;
  college?: College;
  page?: number;
  size?: number;
  sort?: string;
};

export type CreateClubPayload = {
  name: string;
  category: ClubCategory;
  division?: string;
  college?: College | null;
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

export type MyClubRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export type MyClubSummary = {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  myRole: MyClubRole;
  activeRecruitmentCount: number;
  joinedAt: string; // ISO datetime
};

export type UpdateClubPayload = {
  name?: string;
  category?: ClubCategory;
  division?: string | null;
  college?: College;
  clearCollege?: boolean;
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

export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO' | 'NOTICE_COVER' | 'PROMOTION_BANNER' | 'GLOBAL_EVENT_COVER' | 'PROMOTION_REQUEST_BANNER';

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
