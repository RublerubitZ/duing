import { CLOSING_SOON_DAYS, formatRelativeTime } from '@duing/hooks';

import { APPLICATION_STATUS_OPERATOR_LABEL } from '@/app/_constants/application-status';
import { BOOKING_STATUS_META, bookingDateLabel, bookingTimeLabel } from '@/app/_lib/bookingDisplay';
import { waitingDaysTone } from '@/components/dashboard/dashboardChipTone';

import { ACTION_ITEM_TYPE_LABEL, OPERATION_ITEM_TYPE_LABEL } from './dashboard-labels';

import type { ActionItem, ActionItemType, DashboardTask, DashboardTaskGroupKey, OperationItem } from '@duing/types';
import type { DashboardChipTone } from '@/components/dashboard/dashboardChipTone';

export type TaskChip = { text: string; tone: DashboardChipTone };

/** home = 운영진 홈(맥락에 모집명), recruitment = 모집 상세(모집명 없이 인원을 첫째 줄로, 둘째 줄은 라운드 이름·지원 완료/보류 인원·마감 안내). */
export type TaskRowVariant = 'home' | 'recruitment';

export type TaskRowModel = {
  key: string;
  label: string;
  /** null 이면 줄 컴포넌트가 둘째 줄을 그리지 않는다 — 홈은 항상 문자열 */
  context: string | null;
  chip: TaskChip | null;
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

/** 면접 일정 미확정은 라운드 상태마다 다음 단계가 다르다 — 상태 없는 옛 줄은 표 그대로. */
function recruitmentActionLabel(item: ActionItem): string {
  if (item.type === 'INTERVIEW_ROUND_UNCONFIRMED') {
    if (item.roundStatus === 'DRAFT') return '이어서 작성';
    if (item.roundStatus === 'COLLECTING') return '자동 배정';
  }
  return ACTION_ITEM_ACTION_LABEL[item.type];
}

function recruitmentHref(clubId: number, item: ActionItem): `/${string}` {
  switch (item.type) {
    case 'INTERVIEW_ROUND_NEEDED':
      // 대기열·라운드 생성 버튼이 있는 면접 라운드 랜딩으로 이동
      return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview`;
    case 'INTERVIEW_ROUND_UNCONFIRMED':
    case 'INTERVIEW_RESPONSE_UNCOLLECTED':
      // 면접 랜딩·라운드 화면의 '이어서 작성'과 같은 곳 — 마법사가 이어하기·폐기를 묻는다.
      if (item.roundStatus === 'DRAFT') {
        return `/manage/clubs/${clubId}/recruitments/${item.recruitmentId}/interview/rounds/new`;
      }
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

/** 모집 상세 변형 첫째 줄 — 모집 제목은 화면 맨 위에 있어 쓰지 않고, 인원을 라벨 뒤로 올린다. */
function recruitmentDetailLabel(item: ActionItem): string {
  const label = ACTION_ITEM_TYPE_LABEL[item.type];
  return item.count === undefined ? label : `${label} ${item.count}명`;
}

/** 모집 상세 변형 둘째 줄 — 없으면 null. */
function recruitmentDetailContext(item: ActionItem): string | null {
  switch (item.type) {
    case 'INTERVIEW_ROUND_NEEDED':
      return null;
    case 'INTERVIEW_ROUND_UNCONFIRMED':
    case 'INTERVIEW_RESPONSE_UNCOLLECTED':
    case 'INTERVIEW_RESULT_PENDING':
      // 결과 미확정은 확정 라운드가 여럿이면 라운드를 정하지 않는다(roundTitle 없음)
      return item.roundTitle ?? null;
    case 'APPLICANTS_AWAITING_REVIEW': {
      const parts: string[] = [];
      if (item.submitted) parts.push(`${APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED} ${item.submitted}명`);
      if (item.onHold) parts.push(`${APPLICATION_STATUS_OPERATOR_LABEL.ON_HOLD} ${item.onHold}명`);
      return parts.length > 0 ? parts.join(' · ') : null;
    }
    case 'CLOSED_RECRUITMENT_UNDECIDED':
      return '마감 뒤에도 최종 결과를 확정할 수 있어요';
  }
}

function responseDeadlineChip(daysLeft: number): TaskChip {
  if (daysLeft < 0) return { text: `응답 마감 ${-daysLeft}일 지남`, tone: 'late' };
  const text = daysLeft === 0 ? '응답 마감 D-day' : `응답 마감 D-${daysLeft}`;
  return { text, tone: daysLeft <= CLOSING_SOON_DAYS ? 'soon' : 'info' };
}

export function pendingDaysChip(pendingDays: number): TaskChip {
  return { text: pendingDays === 0 ? '미처리 오늘' : `미처리 ${pendingDays}일`, tone: waitingDaysTone(pendingDays) };
}

function presentRecruitment(clubId: number, item: ActionItem, variant: TaskRowVariant): TaskRowModel {
  return {
    key: `${item.type}-${item.recruitmentId}-${item.roundId ?? ''}`,
    label: variant === 'recruitment' ? recruitmentDetailLabel(item) : ACTION_ITEM_TYPE_LABEL[item.type],
    context: variant === 'recruitment' ? recruitmentDetailContext(item) : recruitmentContext(item),
    // 미확정 줄의 daysLeft 는 응답이 다 모인 응답 수집 라운드에만 실린다 — 묶음·순서를 정한 그 기한을 칩으로 보인다.
    chip:
      (item.type === 'INTERVIEW_RESPONSE_UNCOLLECTED' || item.type === 'INTERVIEW_ROUND_UNCONFIRMED') && item.daysLeft !== undefined
        ? responseDeadlineChip(item.daysLeft)
        : item.type === 'APPLICANTS_AWAITING_REVIEW' && item.pendingDays !== undefined
          ? pendingDaysChip(item.pendingDays)
          : null,
    actionLabel: recruitmentActionLabel(item),
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

export function presentDashboardTask(
  clubId: number,
  task: DashboardTask,
  now: Date,
  options: { variant?: TaskRowVariant } = {},
): TaskRowModel {
  return task.source === 'RECRUITMENT'
    ? presentRecruitment(clubId, task.item, options.variant ?? 'home')
    : presentOperation(clubId, task.item, now);
}
