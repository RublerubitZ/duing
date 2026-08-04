import type {
  ActionItem,
  ActionItemType,
  ApplicantStatusTotals,
  InterviewRoundSummary,
  RecruitmentSummary,
  StatsSummary,
  TodayScheduleItem,
} from '@duing/types';
import { daysUntilKst, parseKstInstant } from './dashboardDate';

/** 진행 중 모집 카드에서 D-day 강조(coral)를 적용하는 잔여 일수 윈도 */
export const CLOSING_SOON_DAYS = 3;
export const ACTION_ITEM_PREVIEW_COUNT = 3;

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
};

export function buildActionItems(inputs: RecruitmentDashboardInput[], now: Date): ActionItem[] {
  const items: ActionItem[] = [];

  for (const { recruitment, stats, rounds, candidateCount } of inputs) {
    const base = { recruitmentId: recruitment.id, recruitmentTitle: recruitment.title };

    // 검토 대기 지원자
    if (stats) {
      const awaiting = stats.submitted + stats.onHold;
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
