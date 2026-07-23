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
  tagline: string | null;
  centralClub: boolean;
  activeRecruitment: ClubSummaryRecruitment | null;
};

export type ContactVisibility = 'PUBLIC' | 'LOGGED_IN_ONLY' | 'PRIVATE';

export type FeeCycle = 'NONE' | 'ONE_TIME' | 'SEMESTER' | 'YEARLY' | 'MONTHLY';

export const PROJECT_ICONS = [
  'CODE', 'TROPHY', 'USERS', 'ROCKET', 'BOOK', 'CAMERA', 'PALETTE', 'MUSIC', 'MIC', 'GLOBE',
  'HEART', 'LEAF', 'BRIEFCASE', 'LIGHTBULB', 'FLASK', 'GAMEPAD', 'DUMBBELL', 'GRADUATION',
  'MONITOR', 'SPARKLES',
] as const;
export type ProjectIcon = (typeof PROJECT_ICONS)[number];

export type ClubProject = { icon: ProjectIcon; title: string; subtitle: string | null };

export type ClubSnsPlatform = 'INSTAGRAM' | 'FACEBOOK' | 'KAKAO' | 'OTHER';

export type ClubSnsLink = {
  platform: ClubSnsPlatform;
  label: string | null;
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
  contactPhone: string | null;
  contactVisibility: ContactVisibility;
  activityFrequency: number | null;
  activeDays: ClubDayOfWeek[];
  membershipFeeAmount: number | null;
  feeCycle: FeeCycle;
  tagline: string | null;
  highlights: string[];
  projects: ClubProject[];
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
  activeDays?: ClubDayOfWeek[];
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

export type CloseClubPayload = {
  closureReason?: string;
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
  centralClub: boolean;
  activeRecruitmentCount: number;
};

export type MyClubRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export type MyClubSummary = {
  clubId: number;
  clubName: string;
  logoUrl: string | null;
  status: ClubStatus;
  myRole: MyClubRole;
  activeRecruitmentCount: number;
  joinedAt: string; // ISO datetime
};

// 리더 PATCH clubs/{id} — 잠금 필드(name/category/division/college)는 포함하지 않는다.
export type UpdateClubPayload = {
  clearLogoImage?: boolean;
  clearCoverImage?: boolean;
  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  tags?: string[];
  snsLinks?: ClubSnsLink[];
  faqs?: ClubFaq[];
  foundedYear?: number | null;
  cohortNumber?: number | null;
  location?: string | null;
  contactVisibility?: ContactVisibility;
  activityFrequency?: number | null;
  activeDays?: ClubDayOfWeek[];
  membershipFeeAmount?: number | null;
  feeCycle?: FeeCycle;
  tagline?: string | null;
  highlights?: string[];
  projects?: ClubProject[];
};

// 총동연 PATCH admin/clubs/{id} — 리더 payload + 잠금 필드까지 수정 가능.
export type AdminUpdateClubPayload = UpdateClubPayload & {
  name?: string;
  category?: ClubCategory;
  division?: string | null;
  college?: College;
  clearCollege?: boolean;
};

export type FilePurpose = 'LOGO' | 'COVER' | 'PHOTO' | 'NOTICE_COVER' | 'NOTICE_BODY' | 'PROMOTION_BANNER' | 'GLOBAL_EVENT_COVER' | 'PROMOTION_REQUEST_BANNER' | 'FEDERATION_INQUIRY';

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

export type ClubHeroActivity = {
  id: number;
  clubPhotoId: number;
  storageKey: string;
  caption: string | null;
  width: number | null;
  height: number | null;
  title: string;
  description: string;
  displayOrder: number; // 1..6 슬롯 번호
};

export type CreateHeroActivityPayload = {
  clubPhotoId: number;
  title: string;
  description: string;
  displayOrder: number;
};

export type UpdateHeroActivityPayload = {
  clubPhotoId?: number;
  title?: string;
  description?: string;
};

export type ReorderHeroActivitiesPayload = {
  items: { heroActivityId: number; displayOrder: number }[];
};
