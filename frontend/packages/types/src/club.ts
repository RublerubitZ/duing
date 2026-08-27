import type { RecruitmentDisplayStatus, StudentRecruitmentProjection } from './recruitment';
import type { College } from './user';

export type ClubCategory =
  | 'ACADEMIC'
  | 'CREATION'
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
  /**
   * 단과대 동아리의 소속 학과. 자유입력·선택값이라 미입력이면 null.
   * BE 미배포 전환기에는 필드 자체가 없을 수 있어 옵셔널이다 (User.college 와 같은 규약).
   */
  department?: string | null;
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
  feeNote: string | null;
  tagline: string | null;
  highlights: string[];
  projects: ClubProject[];
  // 회원 기수 표시 여부(운영진 명단·공개 프로필의 기수 노출 제어).
  useGeneration: boolean;
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
  favorite?: boolean;
  page?: number;
  size?: number;
  sort?: string;
};

/**
 * 동아리 상세 조회 기록 요청 — 홈 "관심도가 높은 동아리" 집계용.
 * visitorKey 는 이 브라우저가 보관하는 익명 식별자다(app/_lib/visitorKey.ts).
 * 같은 키로 같은 동아리를 같은 날 여러 번 보내도 서버가 1건으로 접으므로 중복 호출은 무해하다.
 */
export type RecordClubViewPayload = { visitorKey: string };

export type CreateClubPayload = {
  name: string;
  category: ClubCategory;
  division?: string;
  college?: College | null;
  description?: string;
  logoUrl?: string;
  leaderId: number;
  centralClub?: boolean;
  department?: string;
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

/** 기본 확보 시간 대상(시설 크롤 자동 분류 정책) 토글 — 시간 값이 아니라 분류 정책 플래그다. */
export type UpdateClubFacilitySecuredTimeTargetPayload = {
  facilitySecuredTimeTarget: boolean;
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

// 리더 PATCH clubs/{id} — 잠금 필드(name/category/division/college)는 포함하지 않는다(department 는 잠금 아님).
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
  feeNote?: string | null;
  tagline?: string | null;
  highlights?: string[];
  projects?: ClubProject[];
  // 회원 기수 표시 여부(표시 제어 전용). 생략 시 미변경.
  useGeneration?: boolean;
  // 소속 학과 — 잠금 필드가 아니라 운영진도 수정할 수 있다. '' 전송 = 비우기.
  department?: string | null;
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
