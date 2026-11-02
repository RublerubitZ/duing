import { ErrorState } from '@/app/admin/_components/ErrorState';
import { Skeleton } from '@/components/loading/Skeleton';

import { reviewHeatmapCaption } from '../_lib/heatmapPresentation';
import {
  PREVIOUS_WEEK_FAILED_TEXT,
  WEEK_LOAD_FAILED_TEXT,
  screenWeekRange,
  weeklySummarySentences,
} from '../_lib/weeklyBriefingPresentation';
import { FacilityHeatmap } from './FacilityHeatmap';
import { WeekPicker } from './WeekPicker';
import { WeeklyActivityCards } from './WeeklyActivityCards';
import { WeeklyFlowTable } from './WeeklyFlowTable';

import type { AdminWeeklyBriefing } from '@duing/types';
import type { BriefingWeekRange } from '../_lib/briefingWeek';

type Props = {
  weekStart: string;
  range: BriefingWeekRange;
  todayIso: string;
  notice: string | null;
  briefing: AdminWeeklyBriefing | undefined;
  isLoading: boolean;
  onRetry: () => void;
  previous: AdminWeeklyBriefing | null;
  /** 전 주 조회가 끝났는가(성공·실패·꺼짐) — 끝나기 전에는 비교 문장이 늦게 붙어 바뀌지 않게 스켈레톤을 둔다. */
  isPreviousSettled: boolean;
  isPreviousFailed: boolean;
  onRetryPrevious: () => void;
  onNavigate: (weekStart: string) => void;
};

/** 첫 구역 '한 주 돌아보기' — 제목은 고정, 그 아래 큰 기간(가장 최근 주면 '지난주' 꼬리표), 머리 오른쪽에 주 넘기기. */
export function WeeklyReviewSection({
  weekStart,
  range,
  todayIso,
  notice,
  briefing,
  isLoading,
  onRetry,
  previous,
  isPreviousSettled,
  isPreviousFailed,
  onRetryPrevious,
  onNavigate,
}: Props) {
  return (
    <section
      id="weekly-review"
      aria-labelledby="weekly-review-heading"
      className="card p-5 print:border-0 print:p-0 print:shadow-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="weekly-review-heading" className="text-base font-semibold text-ink">한 주 돌아보기</h2>
          <p aria-live="polite" className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-ink-deep">
            <span>{screenWeekRange(weekStart, todayIso)}</span>
            {weekStart === range.latestWeek ? (
              <span className="rounded-full bg-sage-mist px-2 py-0.5 text-xs font-semibold text-ink-deep">지난주</span>
            ) : null}
          </p>
        </div>
        <WeekPicker weekStart={weekStart} range={range} todayIso={todayIso} onNavigate={onNavigate} />
      </div>
      {notice ? <p className="no-print mt-3 rounded-md bg-graysoft px-3 py-2 text-sm text-charcoal-2">{notice}</p> : null}
      <div className="mt-4">
        {briefing && isPreviousSettled ? (
          <WeeklyReviewBody
            weekStart={weekStart}
            briefing={briefing}
            previous={previous}
            isPreviousFailed={isPreviousFailed}
            onRetryPrevious={onRetryPrevious}
          />
        ) : !isLoading && !briefing ? (
          <ErrorState message={WEEK_LOAD_FAILED_TEXT} onRetry={onRetry} />
        ) : (
          <div role="status" aria-label="이 주 지표 불러오는 중" aria-busy="true" className="animate-pulse motion-reduce:animate-none space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        )}
      </div>
      <FacilityHeatmap
        weekStart={weekStart}
        todayIso={todayIso}
        caption={reviewHeatmapCaption(weekStart, todayIso, weekStart === range.latestWeek)}
        isThisWeek={false}
      />
    </section>
  );
}

function WeeklyReviewBody({
  weekStart,
  briefing,
  previous,
  isPreviousFailed,
  onRetryPrevious,
}: {
  weekStart: string;
  briefing: AdminWeeklyBriefing;
  previous: AdminWeeklyBriefing | null;
  isPreviousFailed: boolean;
  onRetryPrevious: () => void;
}) {
  return (
    <>
      <section aria-labelledby="weekly-summary-heading" className="print:break-inside-avoid">
        <h3 id="weekly-summary-heading" className="text-sm font-semibold text-charcoal">한 주 요약</h3>
        {isPreviousFailed ? (
          <div className="mt-2">
            <ErrorState variant="inline" message={PREVIOUS_WEEK_FAILED_TEXT} onRetry={onRetryPrevious} />
          </div>
        ) : null}
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-charcoal-2">
          {weeklySummarySentences(weekStart, briefing, previous).map((sentence) => (
            <li key={sentence} className="break-keep">{sentence}</li>
          ))}
        </ul>
      </section>
      <WeeklyFlowTable weekStart={weekStart} briefing={briefing} previous={previous} />
      <WeeklyActivityCards weekStart={weekStart} briefing={briefing} previous={previous} />
    </>
  );
}
