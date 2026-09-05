// 학생회관 시설 이용현황 — 백엔드 캐시 응답과 1:1 매칭(설계문서 §7).
// 시각 문자열은 백엔드가 KST(+09:00) wall-clock 으로 내려준다. room_seq(학교 내부키)는 응답에 없다.

// 예약 상태 — 백엔드가 Asia/Seoul now 기준으로 조회 시 계산해 응답에만 싣는다(§6.3, 미영속).
export type ReservationStatus = 'UPCOMING' | 'USING' | 'FINISHED';

// 캐시 응답 출처(§7.2, enum 확장 가능).
// CACHE: 캐시만 서빙 / LIVE_FETCH: 이번 요청이 온디맨드 fetch 수행 / STALE_CACHE: 라이브 실패 후 옛 캐시.
export type DataSource = 'CACHE' | 'LIVE_FETCH' | 'STALE_CACHE';

// 병합 완료된 예약 슬롯. start/end 는 'HH:mm'(KST wall-clock).
export type ReservationSlot = {
  date: string; // ISO yyyy-MM-dd
  start: string; // HH:mm
  end: string; // HH:mm
  organization: string; // 정리된 사용단체명
  status: ReservationStatus;
};

// usage/detail 응답의 시설 1건 + 해당 월 예약.
export type FacilityItem = {
  id: number;
  roomName: string;
  location: string | null;
  isUsingNow: boolean;
  currentReservation: ReservationSlot | null;
  nextReservation: ReservationSlot | null;
  reservations: ReservationSlot[];
  // 시설별 예약 오픈일(yyyy-MM-dd). null = 아직 열지 않음(닫힘), 필드 부재 = 구 백엔드(신청 가능으로 폴백).
  bookingOpenDate?: string | null;
};

// GET /api/v1/facilities (§7.1) — 가벼운 활성 시설 목록.
export type FacilitySummary = {
  id: number;
  roomName: string;
  location: string | null;
  // 시설별 예약 오픈일(yyyy-MM-dd). null = 닫힘, 필드 부재 = 구 백엔드.
  bookingOpenDate?: string | null;
};

// GET /api/v1/facilities/usage?yearMonth=YYYY-MM (§7.2, 주력).
export type FacilityUsageResponse = {
  yearMonth: string; // YYYY-MM
  lastUpdatedAt: string | null; // ISO 8601 (+09:00) — 콜드/미수집 월은 null
  stale: boolean;
  source: DataSource;
  facilities: FacilityItem[];
};

// GET /api/v1/facilities/{facilityId}?yearMonth=YYYY-MM (§7.3) — usage 의 단일 시설 슬라이스.
export type FacilityDetailResponse = {
  yearMonth: string;
  lastUpdatedAt: string | null;
  stale: boolean;
  source: DataSource;
  facility: FacilityItem;
};

// ── 시설 대관 신청(P1) — 백엔드 설계 §8 계약과 1:1 ───────────────────────

// DEADLINE_PASSED = 신청 마감(사용일 전날 12:00 KST 경과, 2026-09-03). 서버가 빈 슬롯에만 부여하고 점유(BLOCKED)·대기(PENDING_HOLD)는 유지한다.
export type BookingSlotStatus = 'AVAILABLE' | 'PENDING_HOLD' | 'BLOCKED' | 'PAST' | 'DEADLINE_PASSED';
// 기본 확보 시간(총동연 지정 대상)은 비차단(2026-08-27 전환) — 확보 슬롯은 AVAILABLE 로 내려와 blockedBy 가 없다.
// fail-closed 계약: 예약 가능 여부는 status 만이 결정한다 — 미지의 blockedBy 값도 BLOCKED 표시를 유지한다.
export type BookingSlotBlockSource = 'SCHOOL' | 'INTERNAL';
export type BookingDayStatus = 'AVAILABLE' | 'FULL' | 'PAST';

export type BookingAvailabilitySlot = {
  start: string; // HH:mm
  end: string; // HH:mm
  status: BookingSlotStatus;
  blockedBy?: BookingSlotBlockSource; // BLOCKED 일 때만 존재
  // BLOCKED 차단의 단체명. SCHOOL(크롤)·INTERNAL(승인 완료 예약) 모두 노출한다(§4⁗.1 정책 반전 2026-07-17).
  // PENDING_HOLD(승인 대기)는 아직 비노출이라 생략된다. 구 백엔드는 INTERNAL 에도 부재 → FE 는 "예약됨" 폴백.
  organization?: string;
};

// 기본 확보 시간 정보 행(비차단, 스펙 §3 복원 2026-08-27) — BE 가 BASIC_SECURED_TIME 분류 슬라이스에서
// (단체, 시작, 끝) distinct 로 채운다. 표시 전용(설명 박스·점선 셀·"(기본 확보)" 표기)이며 예약 가능 여부와 무관.
// 구응답은 빈 배열 → 표시만 생략(fail-soft).
export type BookingOperatingNote = {
  organization: string;
  start: string; // HH:mm
  end: string; // HH:mm
};

export type BookingDayAvailability = {
  date: string; // yyyy-MM-dd
  dayStatus: BookingDayStatus;
  availableSlotCount: number;
  operatingNotes: BookingOperatingNote[];
  slots: BookingAvailabilitySlot[]; // 항상 13칸(09~22시)
  // 신청 마감된 날(오늘 이후 & 전날 12:00 KST 경과). 빈 슬롯이 없어 DEADLINE_PASSED 가 없는 날도 true — 날짜 단위 게이팅용.
  // 구 백엔드 응답엔 없다(optional) → FE 는 DEADLINE_PASSED 존재 파생으로 폴백한다(2026-09-03 §9.1).
  applicationClosed?: boolean;
};

// 조회 월은 직전 월·당월·익월(2026-09-03). 직전 월은 저장 스냅샷 기록 열람이라 지난 날짜에도 BLOCKED 점유 정보가 보존된다.
export type FacilityAvailabilityResponse = {
  facilityId: number;
  yearMonth: string; // yyyy-MM
  lastUpdatedAt?: string | null; // 서버가 NON_NULL 직렬화 — 콜드 월은 필드 자체가 생략됨
  stale: boolean;
  // 시설별 신청 창(FE 단일 진실). bookableFrom = max(오픈일, 오늘), bookableUntil = 익월 말일.
  // 닫힘(오픈일 null)·오픈 전은 bookableFrom > bookableUntil 인 빈 창으로 내려온다(D1).
  bookableFrom: string; // yyyy-MM-dd
  bookableUntil: string; // yyyy-MM-dd
  days: BookingDayAvailability[];
};

export type PurposePreset = {
  id: number;
  label: string;
};

export type CreateFacilityBookingPayload = {
  facilityId: number;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  purpose: string;
  // 사용 인원(필수, 2026-07-21 개정) — 서버 @NotNull. 응답 타입은 기존 null 데이터 때문에 optional 유지.
  attendeeCount: number;
  // 대표 연락처(필수) — 서버 검증 패턴 ^01[016789]-?\d{3,4}-?\d{4}$ (하이픈 유무 허용).
  contactPhone: string;
};

export type CreateFacilityBookingResult = {
  bookingId: number;
  status: 'PENDING';
  overlappingPendingCount: number;
};

// 대관 신청 상태(백엔드 BookingStatus 1:1). CONFIRMED/REJECTED/CANCELLED 는 터미널.
export type BookingStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'CONFLICT'
  | 'CANCELLED';

// GET /clubs/{clubId}/facility-bookings — 미페이징 최신순 배열(§8 #3)
export type FacilityBookingSummary = {
  bookingId: number;
  facilityId: number;
  roomName: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm:ss (BE LocalTime 기본 직렬화) — 표시·비교는 앞 5자(HH:mm)만 쓴다
  endTime: string; // HH:mm:ss (BE LocalTime 기본 직렬화) — 표시·비교는 앞 5자(HH:mm)만 쓴다
  status: BookingStatus;
  purpose: string;
  createdAt: string; // ISO LocalDateTime
};

export type FacilityBookingHistoryItem = {
  previousStatus: BookingStatus | null; // 생성 전이는 null
  newStatus: BookingStatus;
  reason: string | null;
  changedAt: string; // ISO LocalDateTime
};

// GET /clubs/{clubId}/facility-bookings/{bookingId} — 이력(최신순) 포함(§8 #4)
export type FacilityBookingDetail = {
  bookingId: number;
  facilityId: number;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  purpose: string;
  attendeeCount?: number; // NON_NULL 직렬화 — null 이면 필드 생략
  // 대표 연락처(운영진 본인 확인용). 기존 행(빈 문자열)은 서버가 null 로 내린다 → FE "—" 폴백(§2.3).
  contactPhone: string | null;
  rejectReason?: string;
  conflictDetail?: string;
  history: FacilityBookingHistoryItem[];
};

// ── 관리자 콘솔(§8 #6~#13) ─────────────────────────────────────────────

export type AdminFacilityBookingSummary = {
  bookingId: number;
  clubId: number;
  clubName: string;
  facilityId: number;
  roomName: string;
  date: string; // yyyy-MM-dd
  startTime: string; // HH:mm
  endTime: string;
  status: BookingStatus;
  purpose: string;
  attendeeCount?: number; // NON_NULL — 선택 입력(개편 스펙 A2), 큐 테이블 인원 표기용
  createdAt: string; // ISO LocalDateTime
  approvedWaitingDays?: number; // NON_NULL — APPROVED 행에만("학교 반영 대기 D+N")
  conflictSuspected: boolean;
  partiallyMatched: boolean;
};

export type AdminBookingOverlapItem = {
  source: string; // 'SCHOOL' | 'INTERNAL' — 관리자 상세 overlaps 는 이 둘만(대기 겹침은 overlappingPendingCount 숫자). string 유지는 미지 값 파싱 실패 방지(fail-open 가드)
  organization: string;
  startTime: string; // HH:mm
  endTime: string;
};

export type AdminFacilityBookingDetail = {
  bookingId: number;
  clubId: number;
  clubName: string;
  facilityId: number;
  roomName: string;
  date: string;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  purpose: string;
  attendeeCount?: number;
  // 대표 연락처(연락 용도, PII). 기존 행(빈 문자열)은 서버가 null 로 내린다 → FE "—" 폴백(§2.3).
  contactPhone: string | null;
  rejectReason?: string;
  conflictDetail?: string;
  matchedScheduleSeq?: number;
  crawlBasisAt?: string; // ISO LocalDateTime — 재크롤 실패·미수집 시 생략
  stale: boolean;
  overlaps: AdminBookingOverlapItem[];
  overlappingPendingCount: number;
  history: FacilityBookingHistoryItem[];
};

export type AdminFacilityBookingCounts = {
  pendingCount: number;
  todaySubmittedCount: number;
  oldestPendingWaitingDays: number;
  approvedWaitingCount: number;
  oldestApprovedWaitingDays: number;
  conflictCount: number;
  conflictSuspectedCount: number;
  confirmedThisMonthCount: number;
  crawledAt?: string; // NON_NULL — 당월 크롤 마지막 수집 시각(개편 스펙 A1), 스냅샷 부재 시 생략
};

// 승인 409(FACILITY_BOOKING_SCHOOL_CONFLICT)의 ApiError.payload 형태(§8.3)
export type FacilityBookingConflictPayload = {
  conflicts: { source: string; organization: string; start: string; end: string }[];
  crawlBasisAt: string | null; // OffsetDateTime(+09:00) 또는 null
};

/** 관리자 큐 정렬. DEFAULT 는 서버의 상태별 기본(PENDING=오래된 순, 그 외=최신순)이며 파라미터를 보내지 않는다. */
export type AdminBookingQueueSort = 'DEFAULT' | 'USAGE_ASC';

export type AdminBookingQueueParams = {
  status?: BookingStatus;
  facilityId?: number;
  dateFrom?: string; // yyyy-MM-dd
  dateTo?: string;
  sort?: AdminBookingQueueSort; // 생략 = DEFAULT
  page?: number;
  size?: number;
};
