'use client';

import { addDaysIso, useAdminClosingRecruitmentsQuery } from '@duing/hooks';

import { AdminSchoolSyncCard } from '@/app/admin/_components/home/AdminSchoolSyncCard';
import { ErrorState } from '@/app/admin/_components/ErrorState';
import { Skeleton } from '@/components/loading/Skeleton';

import { thisWeekHeatmapCaption } from '../_lib/heatmapPresentation';
import { THIS_WEEK_FAILED_TEXT, WEEK_MISMATCH_TEXT, updatedAtText } from '../_lib/thisWeekPresentation';
import { screenWeekRange } from '../_lib/weeklyBriefingPresentation';
import { ClosingRecruitmentList } from './ClosingRecruitmentList';
import { FacilityHeatmap } from './FacilityHeatmap';
import { UpcomingEventsCard } from './UpcomingEventsCard';

type Props = {
  isLatestWeek: boolean;
  latestWeek: string;
  /** 기기 기준 이번 주 월요일 — 다가오는 행사 기간에만 쓴다(구역 머리·히트맵은 서버 weekStart). */
  currentMonday: string;
  todayIso: string;
  onBackToLatest: () => void;
};

/** 둘째 구역 '이번 주 챙길 것' — 가장 최근 주를 볼 때만 그린다. 다른 주에서는 안내 한 줄(인쇄 숨김)만 둔다. */
export function ThisWeekSection({ isLatestWeek, latestWeek, currentMonday, todayIso, onBackToLatest }: Props) {
  if (!isLatestWeek) {
    return (
      <section id="this-week" aria-label="이번 주 챙길 것" className="no-print card mt-6 scroll-mt-16 p-5 md:scroll-mt-6">
        <p className="break-keep text-sm text-charcoal-2">
          {`이번 주 일정은 지난주(${screenWeekRange(latestWeek, todayIso, false)})를 볼 때 함께 보여요.`}
        </p>
        <button type="button" onClick={onBackToLatest} className="btn btn-secondary btn-sm mt-3 min-h-11">
          지난주로 돌아가기
        </button>
      </section>
    );
  }
  return <ThisWeekContent latestWeek={latestWeek} currentMonday={currentMonday} todayIso={todayIso} />;
}

function ThisWeekContent({ latestWeek, currentMonday, todayIso }: { latestWeek: string; currentMonday: string; todayIso: string }) {
  const closingQuery = useAdminClosingRecruitmentsQuery();
  const closing = closingQuery.data;
  // 첫 구역은 기기 시계로, 이 구역은 서버 주로 기간을 잡는다 — 탭을 열어 둔 채 월요일 0시를 넘겼거나 기기 시계가 늦으면 두 구역이 벌어져 그 사실을 알린다.
  const isWeekMismatched = closing !== undefined && closing.weekStart !== addDaysIso(latestWeek, 7);
  return (
    <section
      id="this-week"
      aria-labelledby="this-week-heading"
      // 바로가기 대상 — 모바일 상단 고정 바 아래로 제목이 깔리지 않게 scroll-margin 을 둔다(콘솔 관례, paginationScroll.ts).
      className="card mt-6 scroll-mt-16 p-5 md:scroll-mt-6 print:mt-0 print:break-before-page print:border-0 print:p-0 print:shadow-none"
    >
      <h2 id="this-week-heading" className="text-base font-semibold text-ink">이번 주 챙길 것</h2>
      {closing ? (
        <p className="mt-1 text-sm text-charcoal-2">
          {`${screenWeekRange(closing.weekStart, todayIso)} · ${updatedAtText(closingQuery.dataUpdatedAt)}`}
        </p>
      ) : null}
      {/* 인쇄에도 남긴다 — 인쇄물에서 두 구역의 기간이 어긋난 이유가 된다. */}
      {isWeekMismatched ? (
        <p className="mt-3 break-keep rounded-md bg-graysoft px-3 py-2 text-sm text-charcoal-2">{WEEK_MISMATCH_TEXT}</p>
      ) : null}
      <div className="mt-4 space-y-6">
        {closing ? (
          <>
            <ClosingRecruitmentList recruitments={closing.recruitments} />
            {/* '이번 주'는 서버가 정한 주다 — 기기 시계가 앞서도 히트맵 요청 주를 응답의 weekStart 로 맞춘다. */}
            <FacilityHeatmap
              weekStart={closing.weekStart}
              todayIso={todayIso}
              caption={thisWeekHeatmapCaption(closing.weekStart, todayIso)}
              isThisWeek
            />
          </>
        ) : closingQuery.isError ? (
          <ErrorState message={THIS_WEEK_FAILED_TEXT} onRetry={() => void closingQuery.refetch()} />
        ) : (
          <div role="status" aria-label="이번 주 일정 불러오는 중" aria-busy="true" className="animate-pulse motion-reduce:animate-none space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {/* 둘째 쪽 끝의 작은 카드라 인쇄에서 쪽 경계에 잘리지 않게 한다 — 학교 반영 대기 카드는 홈과 공용이라 감싸는 쪽에 단다. */}
          <div role="region" aria-label="다가오는 행사" className="print:break-inside-avoid [&>*]:h-full">
            <UpcomingEventsCard currentMonday={currentMonday} todayIso={todayIso} />
          </div>
          <div className="print:break-inside-avoid [&>*]:h-full">
            <AdminSchoolSyncCard />
          </div>
        </div>
      </div>
    </section>
  );
}
