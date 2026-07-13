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
};

// GET /api/v1/facilities (§7.1) — 가벼운 활성 시설 목록.
export type FacilitySummary = {
  id: number;
  roomName: string;
  location: string | null;
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

export type BookingSlotStatus = 'AVAILABLE' | 'PENDING_HOLD' | 'BLOCKED' | 'PAST';
export type BookingSlotBlockSource = 'SCHOOL' | 'INTERNAL';
export type BookingDayStatus = 'AVAILABLE' | 'FULL' | 'PAST';

export type BookingAvailabilitySlot = {
  start: string; // HH:mm
  end: string; // HH:mm
  status: BookingSlotStatus;
  blockedBy?: BookingSlotBlockSource; // BLOCKED 일 때만 존재
  // SCHOOL 차단의 단체명(공개 데이터). INTERNAL·PENDING_HOLD 는 비노출 정책이라 생략된다(§16 결정 20).
  organization?: string;
};

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
};

export type FacilityAvailabilityResponse = {
  facilityId: number;
  yearMonth: string; // yyyy-MM
  lastUpdatedAt?: string | null; // 서버가 NON_NULL 직렬화 — 콜드 월은 필드 자체가 생략됨
  stale: boolean;
  bookableFrom: string; // yyyy-MM-dd (오늘)
  bookableUntil: string; // yyyy-MM-dd (익월 말일)
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
  attendeeCount?: number;
};

export type CreateFacilityBookingResult = {
  bookingId: number;
  status: 'PENDING';
  overlappingPendingCount: number;
};
