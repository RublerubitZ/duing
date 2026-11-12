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
import { daysSinceKst, daysUntilKst, parseKstInstant, todayKstDateString } from './dashboardDate';

/** 진행 중 모집 카드에서 D-day 강조(coral)를 적용하는 잔여 일수 윈도 */
export const CLOSING_SOON_DAYS = 3;

/** 미처리 대기가 이 일수(KST 날짜) 이상이면 늦은 것 — 두 콘솔의 칩 톤·운영진 '지금 처리'가 같이 쓴다. 서버 미처리 알림의 168시간 경계와는 다른 규칙이다(합치지 않는다). */
export const STALE_WAITING_DAYS = 7;

// 판정은 raw status — 마감일이 지났어도 수동 마감 전이면 백엔드는 모집을 OPEN(심사 진행 중)으로 다루고,
// 그 구간에 미결 지원자가 남아 있다. displayStatus 로 판정하면 이 필터를 공유하는 진행 중 모집 카드·
// 지원자 요약·처리 필요 업무가 모두 그 모집을 통째로 빼버려 "처리 필요 0건"이 표시된다.
export function isActiveRecruitment(recruitment: RecruitmentSummary): boolean {
  return recruitment.status !== 'CLOSED';
}

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

    // 검토 대기 지원자 — 미처리(보류 제외) 가장 오래된 제출부터 지난 날도 싣는다.
    // 카운트와 MIN 은 서버에서 별도 쿼리라 순간적으로 어긋날 수 있어 미처리 수가 있을 때만 쓴다.
    if (stats) {
      const awaiting = countAwaitingReview(stats);
      if (awaiting > 0) {
        const pendingDays =
          stats.submitted > 0 && typeof stats.oldestPendingSubmittedAt === 'string'
            ? daysSinceKst(stats.oldestPendingSubmittedAt, now)
            : undefined;
        items.push({
          type: 'APPLICANTS_AWAITING_REVIEW',
          ...base,
          count: awaiting,
          submitted: stats.submitted,
          onHold: stats.onHold,
          ...(pendingDays === undefined ? {} : { pendingDays }),
        });
      }
    }

    // 면접 라운드 생성 필요: 대기열 인원 존재 + 발송 전 초안(DRAFT) 없음.
    // 대기열 = 취소되지 않은 라운드에 제외되지 않은 멤버로 들어 있지 않은 면접 대상(제외·라운드 취소면 돌아온다). 기존 라운드에 사람을 더하는 API 가 없어 새 라운드로만 잡는다.
    // 새 라운드 생성을 막는 것은 초안뿐이라(DraftRoundAlreadyExists) 초안이 있으면 아래에서 내는 그 초안의 미확정 줄이 운영진을 데려간다.
    // rounds === undefined(라운드 쿼리 미로딩·실패)면 '초안 없음'으로 단정할 수 없어 생성하지 않는다.
    const hasDraftRound = (rounds ?? []).some((round) => round.status === 'DRAFT');
    if (rounds !== undefined && candidateCount !== undefined && candidateCount > 0 && !hasDraftRound) {
      items.push({ type: 'INTERVIEW_ROUND_NEEDED', ...base, count: candidateCount });
    }

    // 면접 라운드 기반 — 진행 중 라운드마다 한 줄, 인원 0 인 응답 수집·배정 검토 라운드만 줄이 없다.
    for (const round of rounds ?? []) {
      if (isEmptyInProgressRound(round)) continue;
      const roundBase = { ...base, roundId: round.roundId, roundTitle: round.title };
      const daysLeft = round.availabilityDeadline ? daysUntilKst(round.availabilityDeadline, now) : undefined;
      if (round.status === 'COLLECTING' && round.respondedMemberCount < round.totalMemberCount) {
        items.push({
          type: 'INTERVIEW_RESPONSE_UNCOLLECTED', ...roundBase,
          count: round.totalMemberCount - round.respondedMemberCount,
          daysLeft,
        });
      } else if (round.status === 'COLLECTING') {
        // 응답 수는 인원 수를 넘지 않아 이 갈래는 응답이 다 모인 라운드다 — 다음 단계인 자동 배정은 운영진이 눌러야 하고 대신 하는 잡이 없다.
        items.push({ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundBase, roundStatus: round.status, daysLeft });
      } else if (round.status === 'DRAFT' || round.status === 'ASSIGNING') {
        items.push({ type: 'INTERVIEW_ROUND_UNCONFIRMED', ...roundBase, roundStatus: round.status });
      }
    }

    // 결과 미확정: 확정(SCHEDULED) 라운드에 배정됐지만 합/불이 아직 없는 인원.
    // 면접 대상(interviewPending) = 대기열(candidateCount) + 진행 중(초안·응답 수집·배정 검토) 라운드 멤버 + 확정 라운드에서 결과를 기다리는 멤버다 —
    // 한 지원은 취소되지 않은 라운드에 제외되지 않은 멤버로 하나만 들고(라운드 생성 가드), 진행 중 라운드의 제외 안 된 멤버는 모두 면접 대상이다(결과를 정하면 서버가 뺀다, #1659).
    // 그래서 앞의 둘을 빼면 확정 라운드 몫만 남는다. 확정 라운드 인원은 결과를 정한 배정 멤버도 세어 쓸 수 없고, 취소 라운드 멤버는 대기열로 돌아가 빼지 않는다.
    // (대기열 인원은 INTERVIEW_ROUND_NEEDED 소관. candidateCount 미로딩이면 단정 불가라 생성하지 않는다.)
    // shortcut: #1659 전에 결과를 정한 진행 중 라운드 멤버(백필 안 함)는 인원에 남아 그만큼 적게 센다, 그런 행이 문제가 되면 BE 라운드 요약에 결과 대기 인원을 싣는다.
    const scheduledRounds = (rounds ?? []).filter((round) => round.status === 'SCHEDULED');
    if (scheduledRounds.length > 0 && stats !== undefined && candidateCount !== undefined) {
      const inProgressMemberCount = (rounds ?? [])
        .filter((round) => round.status !== 'SCHEDULED' && round.status !== 'CANCELLED')
        .reduce((sum, round) => sum + round.totalMemberCount, 0);
      const assignedPendingCount = stats.interviewPending - candidateCount - inProgressMemberCount;
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

/**
 * 사람이 남지 않은 응답 수집·배정 검토 라운드(전원 결과 확정·제외·탈퇴) — 사람을 더할 수도 확정할 수도 없고 자동 마감도 막지 않아
 * 할 일도 진행 단계도 아니다(취소는 라운드 화면에서). 초안은 새 라운드 생성을 막으므로 들지 않는다.
 */
export function isEmptyInProgressRound(round: InterviewRoundSummary): boolean {
  return (round.status === 'COLLECTING' || round.status === 'ASSIGNING') && round.totalMemberCount === 0;
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

/**
 * 모집 1건의 할 일 — 운영진 홈(useClubActionItems)과 모집 상세(useRecruitmentActionItems)가 함께 쓰는 단일 입구라 두 화면 규칙이 갈리지 않는다.
 * 진행 중(외부 폼 포함)은 buildActionItems, 마감 자체 폼은 결과 미확정만, 마감 외부 폼은 지원서가 없어 없다. 정렬은 부르는 쪽이 한다.
 */
export function buildRecruitmentActionItems(input: RecruitmentDashboardInput, now: Date): ActionItem[] {
  if (isActiveRecruitment(input.recruitment)) return buildActionItems([input], now);
  if (input.recruitment.applicationMode === 'SELF') return buildClosedRecruitmentItems([input]);
  return [];
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
      return 'NOW';
    case 'INTERVIEW_ROUND_UNCONFIRMED':
      // 초안은 운영진이 아직 쓰는 중일 수 있고, 대기열의 '라운드 생성 필요'와 같은 단계라 처리 대기.
      if (task.item.roundStatus === 'DRAFT') return 'WAITING';
      // 응답 마감 날짜(KST)까지는 재응답이 열려 있을 수 있어 기다린다 — 당일은 마감 시각이 지나도 처리 대기(응답 미수집 줄과 같은 날짜 기준).
      if (task.item.roundStatus === 'COLLECTING') return task.item.daysLeft !== undefined && task.item.daysLeft < 0 ? 'NOW' : 'WAITING';
      return 'NOW';
    case 'INTERVIEW_RESPONSE_UNCOLLECTED':
      return task.item.daysLeft !== undefined && task.item.daysLeft < 0 ? 'NOW' : 'WAITING';
    case 'APPLICANTS_AWAITING_REVIEW':
      // 가장 오래된 미처리가 STALE_WAITING_DAYS(KST 날짜) 이상이면 지금 처리로 올린다. 칩과 같은 미리 계산된 값을 읽는다.
      return task.item.pendingDays !== undefined && task.item.pendingDays >= STALE_WAITING_DAYS ? 'NOW' : 'WAITING';
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
    left.source === 'RECRUITMENT' &&
    right.source === 'RECRUITMENT' &&
    left.item.type === 'APPLICANTS_AWAITING_REVIEW' &&
    right.item.type === 'APPLICANTS_AWAITING_REVIEW'
  ) {
    // 오래 기다린 순 — 총동연 대기열과 같은 원칙. 미처리 일수가 없는 쪽은 뒤, 같으면 입력 순서 유지.
    const leftPending = left.item.pendingDays;
    const rightPending = right.item.pendingDays;
    if (leftPending !== undefined && rightPending !== undefined) return rightPending - leftPending;
    if ((leftPending !== undefined) !== (rightPending !== undefined)) return leftPending !== undefined ? -1 : 1;
    return 0;
  }
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
