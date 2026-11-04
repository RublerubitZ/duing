import { CLOSING_SOON_DAYS, formatRelativeTime } from '@duing/hooks';

import { BOOKING_STATUS_META, bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { waitingDaysTone } from '@/components/dashboard/dashboardChipTone';

import { ACTION_ITEM_TYPE_LABEL, OPERATION_ITEM_TYPE_LABEL } from './dashboard-labels';

import type { ActionItem, ActionItemType, DashboardTask, DashboardTaskGroupKey, OperationItem } from '@duing/types';
import type { DashboardChipTone } from '@/components/dashboard/dashboardChipTone';

export type TaskRowModel = {
  key: string;
  label: string;
  context: string;
  chip: { text: string; tone: DashboardChipTone } | null;
  actionLabel: string;
  href: `/${string}`;
};

export const DASHBOARD_TASK_GROUP_LABEL: Record<DashboardTaskGroupKey, string> = {
  NOW: '지금 처리',
  WAITING: '처리 대기',
  INFO: '확인만',
};

const ACTION_ITEM_ACTION_LABEL: Record<ActionItemType, string> = {
  APPLICANTS_AWAITING_REVIEW: '지원자 검토',
  INTERVIEW_ROUND_NEEDED: '라운드 만들기',
  INTERVIEW_ROUND_UNCONFIRMED: '일정 확정',
  INTERVIEW_RESPONSE_UNCOLLECTED: '응답 확인',
  INTERVIEW_RESULT_PENDING: '결과 확정',
  CLOSED_RECRUITMENT_UNDECIDED: '결과 확정',
};

function recruitmentHref(clubId: number, item: ActionItem): `/${string}` {
  switch (item.type) {
    case 'INTERVIEW_ROUND_NEEDED':
      // 대기열·라운드 생성 버튼이 있는 면접 라운드 랜딩으로 이동
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview`;
    case 'INTERVIEW_ROUND_UNCONFIRMED':
    case 'INTERVIEW_RESPONSE_UNCOLLECTED':
      if (item.roundId === undefined) {
        return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview`;
      }
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview/rounds/${item.roundId}`;
    case 'APPLICANTS_AWAITING_REVIEW':
      // 미처리 칩(presentRecruitment)과 같은 조건 — 칩이 보이는 행만 서버 미처리 알림처럼 미처리 필터로 연다.
      // 칩이 없으면 보류만 남았을 수 있어(인원은 보류 포함) 필터 없이 연다.
      return item.pendingDays === undefined
        ? `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/applicants`
        : `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/applicants?status=SUBMITTED`;
    case 'INTERVIEW_RESULT_PENDING':
      // 합/불 결정은 지원자 목록에서 처리하므로 지원자 페이지로 이동 (라운드 귀속 정보는 행 텍스트로만 표시)
    case 'CLOSED_RECRUITMENT_UNDECIDED':
      // 마감 모집이면 지원자 화면이 최종 결과 확정 전용으로 열린다
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/applicants`;
  }
}

/** 기한은 칩으로 옮겼다 — 맥락은 모집명 · 라운드 · 인원만. */
function recruitmentContext(item: ActionItem): string {
  const parts = [item.recruitmentTitle];
  if (item.roundTitle) parts.push(item.roundTitle);
  if (item.count !== undefined) parts.push(`${item.count}명`);
  return parts.join(' · ');
}

function responseDeadlineChip(daysLeft: number): TaskRowModel['chip'] {
  if (daysLeft < 0) return { text: `응답 마감 ${-daysLeft}일 지남`, tone: 'late' };
  const text = daysLeft === 0 ? '응답 마감 D-day' : `응답 마감 D-${daysLeft}`;
  return { text, tone: daysLeft <= CLOSING_SOON_DAYS ? 'soon' : 'info' };
}

function pendingDaysChip(pendingDays: number): TaskRowModel['chip'] {
  return { text: pendingDays === 0 ? '미처리 오늘' : `미처리 ${pendingDays}일`, tone: waitingDaysTone(pendingDays) };
}

function presentRecruitment(clubId: number, item: ActionItem): TaskRowModel {
  return {
    key: `${item.type}-${item.recruitmentId}-${item.roundId ?? ''}`,
    label: ACTION_ITEM_TYPE_LABEL[item.type],
    context: recruitmentContext(item),
    chip:
      item.type === 'INTERVIEW_RESPONSE_UNCOLLECTED' && item.daysLeft !== undefined
        ? responseDeadlineChip(item.daysLeft)
        : item.type === 'APPLICANTS_AWAITING_REVIEW' && item.pendingDays !== undefined
          ? pendingDaysChip(item.pendingDays)
          : null,
    actionLabel: ACTION_ITEM_ACTION_LABEL[item.type],
    href: recruitmentHref(clubId, item),
  };
}

function presentOperation(clubId: number, item: OperationItem, now: Date): TaskRowModel {
  const label = OPERATION_ITEM_TYPE_LABEL[item.type];
  switch (item.type) {
    case 'JOIN_REQUESTS_PENDING':
      return {
        key: item.type,
        label,
        context: `${item.count}건`,
        chip: { text: `가장 오래된 요청 ${formatRelativeTime(item.oldestRequestedAt, now)}`, tone: 'info' },
        actionLabel: '요청 확인',
        href: `/manage/clubs/${clubId}/members/requests`,
      };
    case 'FEE_OVERDUE':
      return {
        key: item.type,
        label,
        context: `연체 청구 ${item.count}건`,
        chip: null,
        actionLabel: '청구 보기',
        // 청구 목록은 최근 생성순 20건 단위라 필터 없이는 연체 청구가 첫 페이지 밖일 수 있다.
        href: `/manage/clubs/${clubId}/fees?tab=bill&status=OVERDUE`,
      };
    case 'BANK_REVIEW_PENDING':
      return {
        key: item.type,
        label,
        context: `확인할 입금 ${item.count}건`,
        chip: null,
        actionLabel: '입금 확인',
        href: `/manage/clubs/${clubId}/fees?tab=bank`,
      };
    case 'FACILITY_BOOKING_ATTENTION':
      return {
        key: `${item.type}-${item.bookingId}`,
        label,
        context: `${item.roomName} · ${bookingDateLabel(item.date)} ${bookingTimeLabel(item.startTime, item.endTime)}`,
        chip: { text: BOOKING_STATUS_META[item.status].label, tone: 'late' },
        actionLabel: '예약 보기',
        // 거절은 "지난 예약" 탭에 있다(bookingTabs.manageTabOf), 충돌은 기본 "진행중" 탭.
        href:
          item.status === 'REJECTED'
            ? `/manage/clubs/${clubId}/facility-bookings?tab=past`
            : `/manage/clubs/${clubId}/facility-bookings`,
      };
  }
}

export function presentDashboardTask(clubId: number, task: DashboardTask, now: Date): TaskRowModel {
  return task.source === 'RECRUITMENT' ? presentRecruitment(clubId, task.item) : presentOperation(clubId, task.item, now);
}
