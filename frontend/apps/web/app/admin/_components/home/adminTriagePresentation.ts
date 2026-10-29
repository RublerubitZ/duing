import { daysUntilKst } from '@duing/hooks';

import { bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { INQUIRY_STATUS_LABEL } from '@/app/_lib/federationInquiryLabels';

import { REPORT_REASON_LABEL, REPORT_TARGET_TYPE_LABEL } from '../../reports/_lib/reportLabels';

import type { AdminPendingCounts, AdminTriageArea, AdminTriageAreaState, AdminTriageItem, AdminTriageQueue } from '@duing/types';
import type { DashboardChipTone } from '@/components/dashboard/dashboardChipTone';

export const ADMIN_TRIAGE_AREA_LABEL: Record<AdminTriageArea, string> = {
  REPORT: '신고',
  INQUIRY: '1:1 문의',
  FACILITY: '시설 예약',
  RECRUITMENT: '미처리 지원',
  PROMOTION: '홍보 요청',
  SUCCESSION: '회장 승계',
  CLUB_APPROVAL: '동아리 승인',
};

export type TriageRowModel = {
  key: string;
  areaLabel: string;
  isDanger: boolean;
  title: string;
  context: string | null;
  chip: { text: string; tone: DashboardChipTone };
  actionLabel: string;
  href: `/${string}`;
};

/** 기다린 날 수(KST 날짜 차이). 기기 시계가 늦어 미래로 보이는 값은 0. */
const waitingDays = (waitingSince: string, now: Date): number => Math.max(0, -daysUntilKst(waitingSince, now));

export const waitingChip = (waitingSince: string, now: Date): TriageRowModel['chip'] => {
  const days = waitingDays(waitingSince, now);
  return { text: days === 0 ? '오늘' : `${days}일`, tone: days >= 7 ? 'late' : days >= 3 ? 'soon' : 'info' };
};

export const presentTriageItem = (item: AdminTriageItem, now: Date): TriageRowModel => {
  const base = {
    key: `${item.area}:${item.id}`,
    areaLabel: ADMIN_TRIAGE_AREA_LABEL[item.area],
    isDanger: item.area === 'REPORT',
    chip: waitingChip(item.waitingSince, now),
  };
  switch (item.area) {
    case 'REPORT':
      return {
        ...base,
        title: item.targetLabel,
        context: `${REPORT_TARGET_TYPE_LABEL[item.targetType]} · ${REPORT_REASON_LABEL[item.reasonCode]}`,
        actionLabel: '신고 검토',
        href: `/admin/reports/${item.id}`,
      };
    case 'INQUIRY':
      return { ...base, title: item.title, context: INQUIRY_STATUS_LABEL[item.status], actionLabel: '답변 작성', href: `/admin/inquiries/${item.id}` };
    case 'FACILITY':
      // 시설 예약은 건별 주소가 없어 검토 탭으로 간다 — 탭 기본 카드가 승인 대기라 충돌 건은 어느 카드에서 찾을지 적는다.
      // 충돌 기간은 상태가 바뀐 시각이 아니라 신청일부터 센다(응답에 전이 시각이 없다).
      // 삭제된 동아리는 서버가 이름을 빈 문자열로 준다.
      return {
        ...base,
        title: `${item.clubName || '삭제된 동아리'} · ${item.roomName}`,
        context: `${bookingDateLabel(item.date)} ${bookingTimeLabel(item.startTime, item.endTime)}${item.status === 'CONFLICT' ? ' · 충돌(신청일 기준, 충돌·의심 카드에서 확인)' : ''}`,
        actionLabel: '예약 검토',
        href: '/admin/facility-bookings?tab=review',
      };
    case 'RECRUITMENT':
      return {
        ...base,
        title: `${item.clubName} · ${item.title}`,
        context: `미처리 ${item.pendingApplicationCount}건`,
        actionLabel: '모집 보기',
        href: `/admin/recruitments/${item.id}`,
      };
    case 'PROMOTION':
      return { ...base, title: `${item.clubName} · ${item.title}`, context: null, actionLabel: '요청 검토', href: `/admin/promotion-requests/${item.id}` };
    case 'SUCCESSION':
      return { ...base, title: item.clubName, context: `요청자 ${item.requesterName}`, actionLabel: '요청 검토', href: `/admin/leader-succession/${item.id}` };
    case 'CLUB_APPROVAL':
      // 승인은 동아리 관리 목록의 상태 변경으로 한다(목록 기본 필터가 승인 대기).
      return { ...base, title: item.clubName, context: '승인 대기', actionLabel: '승인 검토', href: '/admin/clubs' };
  }
};

export type TriageTileKey = AdminTriageArea;

export type TriageTile = {
  key: TriageTileKey;
  label: string;
  countKey: Exclude<keyof AdminPendingCounts, 'totalPendingCount'>;
  isDanger: boolean;
};

// 위험 영역 먼저, 나머지는 대략 시급도 순.
export const ADMIN_TRIAGE_TILES: readonly TriageTile[] = [
  { key: 'REPORT', label: '신고 미처리', countKey: 'reportUnresolved', isDanger: true },
  { key: 'INQUIRY', label: '1:1 문의 미답변', countKey: 'inquiryUnanswered', isDanger: false },
  { key: 'FACILITY', label: '시설 예약 검토', countKey: 'facilityBooking', isDanger: false },
  { key: 'RECRUITMENT', label: '미처리 지원 모집', countKey: 'stalePendingRecruitment', isDanger: false },
  { key: 'PROMOTION', label: '홍보 요청', countKey: 'promotionRequest', isDanger: false },
  { key: 'SUCCESSION', label: '회장 승계', countKey: 'leaderSuccession', isDanger: false },
  { key: 'CLUB_APPROVAL', label: '동아리 승인', countKey: 'clubApproval', isDanger: false },
];

export const triageTileHref = (key: TriageTileKey, inquiryTotals: AdminTriageQueue['inquiryTotals']): `/${string}` => {
  switch (key) {
    case 'REPORT':
      return '/admin/reports?status=PENDING';
    case 'INQUIRY':
      // 건수는 접수+답변중 합이고 목록은 상태 하나만 고른다 — 접수가 비고 답변중만 남았을 때만 답변중 탭으로 연다.
      return inquiryTotals.received === 0 && (inquiryTotals.inProgress ?? 0) > 0
        ? '/admin/inquiries?status=IN_PROGRESS'
        : '/admin/inquiries?status=RECEIVED';
    case 'FACILITY':
      return '/admin/facility-bookings?tab=review';
    case 'RECRUITMENT':
      return '/admin/recruitments?status=OPEN&sort=STALE';
    case 'PROMOTION':
      return '/admin/promotion-requests?status=PENDING';
    case 'SUCCESSION':
      return '/admin/leader-succession?status=PENDING';
    case 'CLUB_APPROVAL':
      return '/admin/clubs';
  }
};

/**
 * 칸 보조 줄(스펙 §5.4). count 는 서버 건수(받기 전·실패면 undefined), area 는 대기열 영역 상태(동아리 승인 시각을 모르면 null).
 * "대기 없음"은 건수를, 기간은 목록을 따른다.
 */
export const triageTileSubline = (count: number | undefined, area: AdminTriageAreaState | null, now: Date): string => {
  if (area === null) {
    if (count === undefined) return '';
    return count > 0 ? '신청 시각 —' : '대기 없음';
  }
  if (count === 0) return '대기 없음';
  if (area.status === 'loading') return '';
  if (area.status === 'error') return '—';
  if (area.oldestWaitingSince !== null) {
    const days = waitingDays(area.oldestWaitingSince, now);
    return days === 0 ? '오늘 접수' : `가장 오래된 건 ${days}일`;
  }
  // 건수는 1건 이상인데 목록이 비었으면 두 요청 사이에 바뀐 것 — 확인되지 않은 "대기 없음"을 쓰지 않는다.
  return count === undefined ? '대기 없음' : '—';
};

/**
 * 동아리 승인을 대기열 행으로 못 넣었을 때(시각 모름·목록 실패·한 페이지 초과·두 요청 사이 어긋남 — 모두 영역 행 0)
 * 건수만 아는 맨 아래 줄을 둔다. 카드의 줄과 빈 상태 판정이 이 함수 하나를 쓴다.
 */
export const clubApprovalFallbackShown = (clubApprovalCount: number, area: AdminTriageAreaState): boolean =>
  clubApprovalCount > 0 && area.rowCount === 0;

/** 대기열 요약 줄 — 시각 있는 표시 행 수와 서버 전체 건수. 둘 다 없으면 null. */
export const triageQueueSummary = (shownCount: number, totalPendingCount: number | undefined): string | null => {
  const parts = [
    shownCount > 0 ? `오래 기다린 ${shownCount}건` : null,
    totalPendingCount !== undefined ? `전체 ${totalPendingCount}건` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
};
