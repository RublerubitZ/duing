import type {
  ActionItem,
  ActionItemType,
  ApplicantStatusTotals,
  BookingStatus,
  DashboardTask,
  DashboardTaskGroup,
  DashboardTaskGroupKey,
  FacilityAttentionStatus,
  FacilityBookingSummary,
  FeeBillSummary,
  InterviewRoundSummary,
  JoinRequestSummary,
  OperationItem,
  OperationItemType,
  RecruitmentSummary,
  StatsSummary,
  TodayScheduleItem,
} from '@duing/types';
import { daysUntilKst, parseKstInstant, todayKstDateString } from './dashboardDate';

/** 진행 중 모집 카드에서 D-day 강조(coral)를 적용하는 잔여 일수 윈도 */
export const CLOSING_SOON_DAYS = 3;

/** 모집 1건 + 그 모집의 통계·면접 라운드 묶음 */
export type RecruitmentDashboardInput = {
  recruitment: RecruitmentSummary;
  stats: StatsSummary | undefined;
  rounds: InterviewRoundSummary[] | undefined;
  /** 면접 대기열 인원 수 — 비면접 모집은 undefined */
  candidateCount: number | undefined;
};

const TYPE_PRIORITY: Record<ActionItemType, number> = {
  INTERVIEW_ROUND_NEEDED: 0,
  INTERVIEW_ROUND_UNCONFIRMED: 1,
  INTERVIEW_RESPONSE_UNCOLLECTED: 2,
  INTERVIEW_RESULT_PENDING: 3,
  APPLICANTS_AWAITING_REVIEW: 4,
  CLOSED_RECRUITMENT_UNDECIDED: 5,
};

export function buildActionItems(inputs: RecruitmentDashboardInput[], now: Date): ActionItem[] {
  const items: ActionItem[] = [];

  for (const { recruitment, stats, rounds, candidateCount } of inputs) {
    const base = { recruitmentId: recruitment.id, recruitmentTitle: recruitment.title };

    // 검토 대기 지원자
    if (stats) {
      const awaiting = countAwaitingReview(stats);
      if (awaiting > 0) {
        items.push({ type: 'APPLICANTS_AWAITING_REVIEW', ...base, count: awaiting });
      }
    }

    // 면접 라운드 생성 필요: 대기열 인원 존재 + 신규 인원 수용 가능 라운드(DRAFT·COLLECTING·ASSIGNING) 없음
    // (SCHEDULED는 확정 라운드라 수용 불가, CANCELLED는 무시)
    // rounds === undefined(라운드 쿼리 미로딩·실패)면 '수용 라운드 없음'으로 단정할 수 없어 생성하지 않는다.
    const hasAcceptingRound = (rounds ?? []).some(
      (round) => round.status === 'DRAFT' || round.status === 'COLLECTING' || round.status === 'ASSIGNING',
    );
    if (rounds !== undefined && candidateCount !== undefined && candidateCount > 0 && !hasAcceptingRound) {
      items.push({ type: 'INTERVIEW_ROUND_NEEDED', ...base, count: candidateCount });
    }

    // 면접 라운드 기반
    for (const round of rounds ?? []) {
      if (round.status === 'ASSIGNING') {
        items.push({ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...base, roundId: round.roundId, roundTitle: round.title });
      }
      if (round.status === 'COLLECTING' && round.respondedMemberCount < round.totalMemberCount) {
        items.push({
          type: 'INTERVIEW_RESPONSE_UNCOLLECTED', ...base,
          roundId: round.roundId, roundTitle: round.title,
          count: round.totalMemberCount - round.respondedMemberCount,
          daysLeft: round.availabilityDeadline ? daysUntilKst(round.availabilityDeadline, now) : undefined,
        });
      }
    }

    // 결과 미확정: SCHEDULED 라운드에 배정됐지만 합/불 미결정인 인원(배정됨 ∩ 미결정).
    // interviewPending에는 대기열 인원도 포함되므로 candidateCount를 빼서 배정 인원만 센다.
    // (대기열 인원은 INTERVIEW_ROUND_NEEDED 소관. candidateCount 미로딩이면 단정 불가라 생성하지 않는다.)
    const scheduledRounds = (rounds ?? []).filter((round) => round.status === 'SCHEDULED');
    if (scheduledRounds.length > 0 && stats !== undefined && candidateCount !== undefined) {
      const assignedPendingCount = stats.interviewPending - candidateCount;
      if (assignedPendingCount > 0) {
        // 단일 SCHEDULED 라운드면 그 라운드로 귀속, 복수면 모집 단위로만 노출
        const attributedRound = scheduledRounds.length === 1 ? scheduledRounds[0] : undefined;
        items.push({
          type: 'INTERVIEW_RESULT_PENDING', ...base,
          roundId: attributedRound?.roundId, roundTitle: attributedRound?.title,
          count: assignedPendingCount,
        });
      }
    }
  }

  return items;
}

/** 검토 대기 = 지원 완료 + 보류 — 면접 대상은 이미 검토를 넘긴 지원이라 세지 않는다. */
export function countAwaitingReview(stats: StatsSummary): number {
  return stats.submitted + stats.onHold;
}

/** 결과(합격·불합격)가 아직 없는 지원 수 — 마감 모집에서 확정할 수 있는 지원과 같은 집합이다(#892). */
export function countUndecided(stats: StatsSummary): number {
  return stats.submitted + stats.onHold + stats.interviewPending;
}

/** 마감 모집 1건 + 그 모집의 통계 */
export type ClosedRecruitmentDashboardInput = Pick<RecruitmentDashboardInput, 'recruitment' | 'stats'>;

/**
 * 마감 모집에 남은 미결 지원. 마감 뒤에도 최종 결과 확정은 열려 있는데(#892),
 * 진행 중 모집만 보는 buildActionItems 로는 운영진 화면 어디에도 드러나지 않는다.
 * 통계 미로딩·실패(undefined)면 단정할 수 없어 만들지 않는다.
 */
export function buildClosedRecruitmentItems(inputs: ClosedRecruitmentDashboardInput[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const { recruitment, stats } of inputs) {
    const undecidedCount = stats ? countUndecided(stats) : 0;
    if (undecidedCount > 0) {
      items.push({
        type: 'CLOSED_RECRUITMENT_UNDECIDED',
        recruitmentId: recruitment.id,
        recruitmentTitle: recruitment.title,
        count: undecidedCount,
      });
    }
  }
  return items;
}

export function sortActionItems(items: ActionItem[]): ActionItem[] {
  return [...items].sort((a, b) => {
    const aHas = a.daysLeft !== undefined;
    const bHas = b.daysLeft !== undefined;
    if (aHas && bHas && a.daysLeft !== b.daysLeft) return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
    if (aHas !== bHas) return aHas ? -1 : 1;
    return TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
  });
}

export function aggregateApplicantTotals(statsList: Array<StatsSummary | undefined>): ApplicantStatusTotals {
  const totals: ApplicantStatusTotals = {
    total: 0, submitted: 0, onHold: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 0,
  };
  for (const statsEntry of statsList) {
    if (!statsEntry) continue;
    totals.total += statsEntry.total;
    totals.submitted += statsEntry.submitted;
    totals.onHold += statsEntry.onHold;
    totals.interviewPending += statsEntry.interviewPending;
    totals.accepted += statsEntry.accepted;
    totals.rejected += statsEntry.rejected;
    totals.capacity += statsEntry.capacity;
  }
  return totals;
}

const KIND_RANK = { INTERVIEW: 0, EVENT: 1 } as const;

export function sortTodaySchedule(items: TodayScheduleItem[]): TodayScheduleItem[] {
  return [...items].sort((a, b) => {
    const byTime = parseKstInstant(a.startAt).getTime() - parseKstInstant(b.startAt).getTime();
    if (byTime !== 0) return byTime;
    return KIND_RANK[a.kind] - KIND_RANK[b.kind];
  });
}

/** 운영 업무 출처 묶음 — 조회 전·실패면 undefined 로 들어와 항목을 만들지 않는다. */
export type OperationItemsInput = {
  pendingJoinRequests: JoinRequestSummary[] | undefined;
  feeSummary: FeeBillSummary | undefined;
  bankPendingCount: number | undefined;
  bookings: FacilityBookingSummary[] | undefined;
};

function isAttentionStatus(status: BookingStatus): status is FacilityAttentionStatus {
  return status === 'REJECTED' || status === 'CONFLICT';
}

/** 거절·충돌 예약 중 예약일(KST)이 오늘 이후인 것 — 지난 예약은 확인할 이유가 없어 빠진다(읽음 상태가 없어서 대신하는 규칙). */
export function selectAttentionBookings(bookings: FacilityBookingSummary[], now: Date): OperationItem[] {
  const today = todayKstDateString(now);
  const items: OperationItem[] = [];
  for (const booking of bookings) {
    if (!isAttentionStatus(booking.status) || booking.date < today) continue;
    items.push({
      type: 'FACILITY_BOOKING_ATTENTION',
      bookingId: booking.bookingId,
      roomName: booking.roomName,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      status: booking.status,
    });
  }
  return items;
}

export function buildOperationItems(input: OperationItemsInput, now: Date): OperationItem[] {
  const items: OperationItem[] = [];
  const joinRequests = input.pendingJoinRequests ?? [];
  const [firstRequest, ...restRequests] = joinRequests;
  if (firstRequest) {
    // requestedAt 은 절대시각(…Z) — 문자열이 아니라 시각으로 비교한다.
    const oldest = restRequests.reduce(
      (earliest, request) =>
        parseKstInstant(request.requestedAt).getTime() < parseKstInstant(earliest.requestedAt).getTime() ? request : earliest,
      firstRequest,
    );
    items.push({ type: 'JOIN_REQUESTS_PENDING', count: joinRequests.length, oldestRequestedAt: oldest.requestedAt });
  }
  if (input.feeSummary && input.feeSummary.overdueCount > 0) {
    items.push({ type: 'FEE_OVERDUE', count: input.feeSummary.overdueCount });
  }
  if (input.bankPendingCount !== undefined && input.bankPendingCount > 0) {
    items.push({ type: 'BANK_REVIEW_PENDING', count: input.bankPendingCount });
  }
  items.push(...selectAttentionBookings(input.bookings ?? [], now));
  return items;
}

/** 모집 업무 우선순위(TYPE_PRIORITY 0~5) 뒤에 잇는다. */
const OPERATION_PRIORITY: Record<OperationItemType, number> = {
  FEE_OVERDUE: 6,
  JOIN_REQUESTS_PENDING: 7,
  BANK_REVIEW_PENDING: 8,
  FACILITY_BOOKING_ATTENTION: 9,
};

export const DASHBOARD_TASK_GROUP_ORDER: readonly DashboardTaskGroupKey[] = ['NOW', 'WAITING', 'INFO'];

/** 누군가 결과를 기다리거나 기한이 지났으면 지금 처리. */
export function dashboardTaskGroupOf(task: DashboardTask): DashboardTaskGroupKey {
  if (task.source === 'OPERATION') {
    switch (task.item.type) {
      case 'FEE_OVERDUE':
        return 'NOW';
      case 'FACILITY_BOOKING_ATTENTION':
        return 'INFO';
      case 'JOIN_REQUESTS_PENDING':
      case 'BANK_REVIEW_PENDING':
        return 'WAITING';
    }
  }
  switch (task.item.type) {
    case 'CLOSED_RECRUITMENT_UNDECIDED':
    case 'INTERVIEW_RESULT_PENDING':
    case 'INTERVIEW_ROUND_UNCONFIRMED':
      return 'NOW';
    case 'INTERVIEW_RESPONSE_UNCOLLECTED':
      return task.item.daysLeft !== undefined && task.item.daysLeft < 0 ? 'NOW' : 'WAITING';
    case 'APPLICANTS_AWAITING_REVIEW':
    case 'INTERVIEW_ROUND_NEEDED':
      return 'WAITING';
  }
}

function taskDaysLeft(task: DashboardTask): number | undefined {
  return task.source === 'RECRUITMENT' ? task.item.daysLeft : undefined;
}

function taskPriority(task: DashboardTask): number {
  return task.source === 'RECRUITMENT' ? TYPE_PRIORITY[task.item.type] : OPERATION_PRIORITY[task.item.type];
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareTasks(left: DashboardTask, right: DashboardTask): number {
  const leftDays = taskDaysLeft(left);
  const rightDays = taskDaysLeft(right);
  if (leftDays !== undefined && rightDays !== undefined && leftDays !== rightDays) return leftDays - rightDays;
  if ((leftDays !== undefined) !== (rightDays !== undefined)) return leftDays !== undefined ? -1 : 1;
  const byPriority = taskPriority(left) - taskPriority(right);
  if (byPriority !== 0) return byPriority;
  if (
    left.source === 'OPERATION' &&
    right.source === 'OPERATION' &&
    left.item.type === 'FACILITY_BOOKING_ATTENTION' &&
    right.item.type === 'FACILITY_BOOKING_ATTENTION'
  ) {
    return (
      compareText(left.item.date, right.item.date) ||
      compareText(left.item.startTime, right.item.startTime) ||
      left.item.bookingId - right.item.bookingId
    );
  }
  return 0;
}

/** 모집 업무 + 운영 업무 → 비어 있지 않은 묶음만, 정해진 순서로. 묶음 안은 안정 정렬. */
export function groupDashboardTasks(actionItems: ActionItem[], operationItems: OperationItem[]): DashboardTaskGroup[] {
  const tasks: DashboardTask[] = [
    ...actionItems.map((item): DashboardTask => ({ source: 'RECRUITMENT', item })),
    ...operationItems.map((item): DashboardTask => ({ source: 'OPERATION', item })),
  ];
  return DASHBOARD_TASK_GROUP_ORDER.map((key) => ({
    key,
    tasks: tasks.filter((task) => dashboardTaskGroupOf(task) === key).sort(compareTasks),
  })).filter((group) => group.tasks.length > 0);
}
