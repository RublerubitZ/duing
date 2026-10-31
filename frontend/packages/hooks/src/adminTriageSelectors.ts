import type {
  AdminClubSummary,
  AdminFacilityBookingSummary,
  AdminFederationInquirySummary,
  AdminPromotionRequestSummary,
  AdminRecruitmentListItem,
  AdminReportSummary,
  AdminSuccessionSummary,
  AdminTriageArea,
  AdminTriageItem,
} from '@duing/types';
import { parseKstInstant } from './dashboardDate';

/** 대기열에 보여 줄 최대 행 수. 서버가 오래된 순으로 주는 시설 검토 대기도 이만큼만 받는다. */
export const ADMIN_TRIAGE_QUEUE_LIMIT = 10;
/** 최신순 목록을 받는 페이지 크기 — 서버 상한(100)이다. */
export const ADMIN_TRIAGE_PAGE_SIZE = 100;
// 서버 미처리 리마인더·배지와 같은 경계 — 달력 7일이 아니라 정확히 168시간(PendingApplicationPolicy).
const STALE_PENDING_MS = 7 * 86_400_000;
// 같은 시각이면 방치 피해가 큰 영역 먼저.
const AREA_ORDER: Record<AdminTriageArea, number> = {
  REPORT: 0,
  INQUIRY: 1,
  FACILITY: 2,
  RECRUITMENT: 3,
  PROMOTION: 4,
  SUCCESSION: 5,
  CLUB_APPROVAL: 6,
  INACTIVE_CLUB: 7,
};

/**
 * 최신순 목록(서버 정렬 고정)에서 가장 오래된 QUEUE_LIMIT 건(전체 인덱스 N−10..N−1)이 든 페이지 중,
 * 이미 받은 첫 페이지를 뺀 번호. 끝 페이지에 10건이 안 들면 바로 앞 페이지도 받는다.
 * 페이지 크기가 ADMIN_TRIAGE_QUEUE_LIMIT 이상이라는 전제다 — 더 작으면 오래된 10건이 세 페이지 이상에 걸친다.
 */
export const oldestTailPages = (totalElements: number, totalPages: number, pageSize: number): number[] => {
  // 페이지 크기는 응답의 size — 서버가 요청 크기(100)보다 작게 자르면 그 크기로 페이지 번호가 매겨진다.
  if (totalElements <= pageSize || totalPages < 2) return [];
  const lastPage = totalPages - 1;
  const lastPageCount = totalElements - pageSize * lastPage;
  return lastPageCount < ADMIN_TRIAGE_QUEUE_LIMIT && lastPage >= 2 ? [lastPage - 1, lastPage] : [lastPage];
};

export const reportTriageItem = (report: AdminReportSummary): AdminTriageItem => ({
  area: 'REPORT',
  id: report.id,
  waitingSince: report.createdAt,
  targetType: report.targetType,
  targetLabel: report.targetLabel,
  reasonCode: report.reasonCode,
});

export const inquiryTriageItem = (inquiry: AdminFederationInquirySummary): AdminTriageItem => ({
  area: 'INQUIRY',
  id: inquiry.id,
  waitingSince: inquiry.createdAt,
  title: inquiry.title,
  status: inquiry.status,
});

export const facilityTriageItem = (booking: AdminFacilityBookingSummary): AdminTriageItem => ({
  area: 'FACILITY',
  id: booking.bookingId,
  waitingSince: booking.createdAt,
  clubName: booking.clubName,
  roomName: booking.roomName,
  date: booking.date,
  startTime: booking.startTime,
  endTime: booking.endTime,
  status: booking.status,
});

export const promotionTriageItem = (request: AdminPromotionRequestSummary): AdminTriageItem => ({
  area: 'PROMOTION',
  id: request.id,
  waitingSince: request.createdAt,
  clubName: request.club.name,
  title: request.title,
});

export const successionTriageItem = (request: AdminSuccessionSummary): AdminTriageItem => ({
  area: 'SUCCESSION',
  id: request.id,
  waitingSince: request.createdAt,
  clubName: request.clubName,
  requesterName: request.requester.name,
});

/** 승인 대기 동아리 중 대기 시작 시각이 있는 것만 항목으로 — null 은 서버가 '대기 아님'이라 한 것, 부재는 옛 백엔드라 넣지 않는다. */
export const pendingClubTriageItems = (clubs: AdminClubSummary[]): AdminTriageItem[] =>
  clubs.flatMap((club): AdminTriageItem[] =>
    typeof club.pendingSince === 'string'
      ? [{ area: 'CLUB_APPROVAL', id: club.id, waitingSince: club.pendingSince, clubName: club.name }]
      : [],
  );

/**
 * 남은 미결이 있는 운영 중단 동아리 — 두 건수가 숫자이고 합이 1 이상이며 운영 중단 시각이 있을 때만 항목으로.
 * 건수 부재는 옛 백엔드라 넣지 않는다(옛 백엔드는 needsPendingCleanup 을 무시해 운영 중단 동아리 전부를 준다).
 */
export const inactiveClubTriageItems = (clubs: AdminClubSummary[]): AdminTriageItem[] =>
  clubs.flatMap((club): AdminTriageItem[] => {
    const { undecidedApplicationCount, pendingJoinRequestCount, statusChangedAt } = club;
    if (typeof undecidedApplicationCount !== 'number' || typeof pendingJoinRequestCount !== 'number') return [];
    if (undecidedApplicationCount + pendingJoinRequestCount < 1 || statusChangedAt === null) return [];
    return [
      {
        area: 'INACTIVE_CLUB',
        id: club.id,
        waitingSince: statusChangedAt,
        clubName: club.name,
        undecidedApplicationCount,
        pendingJoinRequestCount,
      },
    ];
  });

/** 진행 중 모집 중 가장 오래된 미처리 지원서가 168시간 이상(경계 포함) 기다린 것. */
export const staleRecruitmentTriageItems = (recruitments: AdminRecruitmentListItem[], now: Date): AdminTriageItem[] => {
  const cutoffMs = now.getTime() - STALE_PENDING_MS;
  return recruitments.flatMap((recruitment): AdminTriageItem[] => {
    const submittedAt = recruitment.oldestPendingSubmittedAt;
    if (recruitment.status !== 'OPEN' || submittedAt === null) return [];
    if (parseKstInstant(submittedAt).getTime() > cutoffMs) return [];
    return [
      {
        area: 'RECRUITMENT',
        id: recruitment.recruitmentId,
        waitingSince: submittedAt,
        clubName: recruitment.clubName,
        title: recruitment.title,
        pendingApplicationCount: recruitment.pendingApplicationCount ?? 0,
      },
    ];
  });
};

// shortcut: 정렬 비교마다 시각 문자열을 다시 파싱하고, 칸·대기열 카드가 같은 훅을 불러 두 번 합친다 — 영역마다 100건씩 차는 규모가 되면 훅에서 입력 data 기준으로 memo 한다.
const waitingMs = (item: AdminTriageItem): number => parseKstInstant(item.waitingSince).getTime();

/** (영역, 식별자)로 중복을 빼고 오래 기다린 순 → 영역 순서 → 식별자 순으로 정렬해 상위 QUEUE_LIMIT 건. */
export const mergeTriageQueue = (items: AdminTriageItem[]): AdminTriageItem[] => {
  // 끝 페이지를 받는 사이 새 건이 들어오면 페이지 경계가 밀려 같은 건이 두 번 온다.
  const seenKeys = new Set<string>();
  const uniqueItems = items.filter((item) => {
    const itemKey = `${item.area}:${item.id}`;
    if (seenKeys.has(itemKey)) return false;
    seenKeys.add(itemKey);
    return true;
  });
  return uniqueItems
    .sort(
      (left, right) =>
        waitingMs(left) - waitingMs(right) || AREA_ORDER[left.area] - AREA_ORDER[right.area] || left.id - right.id,
    )
    .slice(0, ADMIN_TRIAGE_QUEUE_LIMIT);
};

export const oldestWaitingSince = (items: AdminTriageItem[]): string | null => {
  return items.reduce<string | null>(
    (oldest, item) => (oldest === null || waitingMs(item) < parseKstInstant(oldest).getTime() ? item.waitingSince : oldest),
    null,
  );
};
