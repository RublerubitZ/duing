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

export const CLOSING_SOON_DAYS = 3;
export const ACTION_ITEM_PREVIEW_COUNT = 3;

/** 모집 1건 + 그 모집의 통계·면접 라운드 묶음 */
export type RecruitmentDashboardInput = {
  recruitment: RecruitmentSummary;
  stats: StatsSummary | undefined;
  rounds: InterviewRoundSummary[] | undefined;
};

const TYPE_PRIORITY: Record<ActionItemType, number> = {
  INTERVIEW_ROUND_UNCONFIRMED: 0,
  INTERVIEW_RESPONSE_UNCOLLECTED: 1,
  RECRUITMENT_CLOSING_SOON: 2,
  INTERVIEW_RESULT_PENDING: 3,
  APPLICANTS_AWAITING_REVIEW: 4,
};

export function buildActionItems(inputs: RecruitmentDashboardInput[], now: Date): ActionItem[] {
  const items: ActionItem[] = [];

  for (const { recruitment, stats, rounds } of inputs) {
    const base = { recruitmentId: recruitment.id, recruitmentTitle: recruitment.title };

    // 검토 대기 지원자
    if (stats) {
      const awaiting = stats.submitted + stats.underReview;
      if (awaiting > 0) {
        items.push({ type: 'APPLICANTS_AWAITING_REVIEW', ...base, count: awaiting });
      }
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

    // 결과 미확정(근사): SCHEDULED 라운드 존재 + 면접대기 인원
    const hasScheduled = (rounds ?? []).some((r) => r.status === 'SCHEDULED');
    if (hasScheduled && stats && stats.interviewPending > 0) {
      items.push({ type: 'INTERVIEW_RESULT_PENDING', ...base, count: stats.interviewPending });
    }

    // 마감 임박: 종료 아님 + endDate D-N 이내(경과 제외)
    if (recruitment.displayStatus !== 'CLOSED' && recruitment.displayStatus !== 'ALWAYS_OPEN' && recruitment.endDate) {
      const daysLeft = daysUntilKst(recruitment.endDate, now);
      if (daysLeft >= 0 && daysLeft <= CLOSING_SOON_DAYS) {
        items.push({ type: 'RECRUITMENT_CLOSING_SOON', ...base, daysLeft });
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
    total: 0, submitted: 0, underReview: 0, interviewPending: 0, accepted: 0, rejected: 0, capacity: 0,
  };
  for (const statsEntry of statsList) {
    if (!statsEntry) continue;
    totals.total += statsEntry.total;
    totals.submitted += statsEntry.submitted;
    totals.underReview += statsEntry.underReview;
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
