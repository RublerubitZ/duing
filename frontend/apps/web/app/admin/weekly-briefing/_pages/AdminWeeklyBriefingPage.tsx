'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useParams, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@duing/api';
import {
  addDaysIso,
  adminQueryKeys,
  useAdminClosingRecruitmentsQuery,
  useAdminWeeklyBriefingQuery,
  useAdminWeeklyFacilityHeatmapQuery,
} from '@duing/hooks';
import { kstDateTimeFormatter, todayKstDateString } from '@duing/hooks/datetime';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useHydrated } from '@/app/_lib/useHydrated';
import { LoadingGate } from '@/components/loading/LoadingGate';

import { ThisWeekSection } from '../_components/ThisWeekSection';
import { WeeklyReviewSection } from '../_components/WeeklyReviewSection';
import { briefingWeekRange, resolveRequestedWeek } from '../_lib/briefingWeek';
import { thisWeekBasisText } from '../_lib/thisWeekPresentation';
import { formatWeekRange, newWeekStartedText } from '../_lib/weeklyBriefingPresentation';

const WEEK_MS = 7 * 86_400_000;
const BRIEFING_PATH = '/admin/weekly-briefing';
const PRINTED_AT_FORMAT = kstDateTimeFormatter({ year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** 총동연 주간 브리핑 — 지난주에 접수·처리한 일(주 단위로 넘겨 봄·인쇄). */
export function AdminWeeklyBriefingPage() {
  const hydrated = useHydrated();
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 print:max-w-none print:px-0 print:py-0">
      {/* 기본 주·버튼 상태는 '오늘'에서 계산한다 — 서버 HTML 과 기기 시계가 서로 다른 주를 그리지 않게 하이드레이션 뒤에 그린다. */}
      {hydrated ? <WeeklyBriefingContent /> : <LoadingGate className="min-h-0 py-16" label="주간 브리핑 불러오는 중" />}
    </main>
  );
}

function WeeklyBriefingContent() {
  const searchParams = useSearchParams();
  // 값은 쓰지 않는다 — Next 가 내비게이션마다(같은 주소로 다시 들어와도) 새로 만들어 주므로 내비게이션 신호로만 쓴다(주소 정리 다시 돌리기·고정한 주 풀기).
  const navigationParams = useParams();
  const router = useGuardedRouter();
  const queryClient = useQueryClient();
  // 범위를 잡은 시각 — 처음엔 연 시각이고, 탭을 열어 둔 채 KST 월요일을 넘기면 다시 보일 때·인쇄 직전에 그 순간으로 다시 잡는다.
  const [rangeTakenAt, setRangeTakenAt] = useState(() => new Date());
  // 기기 시계가 앞서 서버가 '아직 끝나지 않은 주'라고 하면 한 주 물러선 시계로 범위를 다시 잡는다 — 범위를 새로 잡기 전까지 한 번만.
  const [clockSteppedBack, setClockSteppedBack] = useState(false);
  const range = briefingWeekRange(clockSteppedBack ? new Date(rangeTakenAt.getTime() - WEEK_MS) : rangeTakenAt);
  // 범위를 새로 잡을 때 보던 주를 다음 내비게이션까지 지킨다 — 주소의 week(없음·진행 중이던 주)를 새 범위로 다시 풀면 다른 주가 된다.
  const [pinnedWeek, setPinnedWeek] = useState<{ weekStart: string; wasLatestWeek: boolean; navigation: typeof navigationParams } | null>(null);
  const isWeekPinned = pinnedWeek !== null && pinnedWeek.navigation === navigationParams;
  const requestedWeek = isWeekPinned ? pinnedWeek.weekStart : searchParams.get('week');
  const weekStart = resolveRequestedWeek(requestedWeek, range).weekStart;
  const isLatestWeek = weekStart === range.latestWeek;
  const [notice, setNotice] = useState(() => resolveRequestedWeek(requestedWeek, range).notice);
  const todayIso = todayKstDateString(rangeTakenAt);

  const briefingQuery = useAdminWeeklyBriefingQuery(weekStart, { isLatestWeek });
  // 가장 이른 주의 전 주는 서버 범위 밖이라 부르지 않고 비교만 뺀다(알림 없음).
  const isPreviousEnabled = weekStart > range.oldestWeek;
  const previousQuery = useAdminWeeklyBriefingQuery(addDaysIso(weekStart, -7), { enabled: isPreviousEnabled });
  const isAwaitingStepBack =
    !clockSteppedBack && briefingQuery.error instanceof ApiError && briefingQuery.error.code === 'WEEK_NOT_ENDED';
  // 한 주 돌아보기 히트맵(FacilityHeatmap)과 같은 키라 요청은 하나다 — 인쇄 대기 판정에만 쓴다.
  const reviewHeatmapQuery = useAdminWeeklyFacilityHeatmapQuery(weekStart);
  // 둘째 구역(가장 최근 주에만 그림)의 이번 주 모집·이번 주 히트맵 — ThisWeekSection 과 같은 키라 요청은 하나다. 인쇄 대기 판정에만 쓴다.
  const closingQuery = useAdminClosingRecruitmentsQuery({ enabled: isLatestWeek });
  const thisWeekStart = isLatestWeek ? closingQuery.data?.weekStart : undefined;
  const thisWeekHeatmapQuery = useAdminWeeklyFacilityHeatmapQuery(thisWeekStart ?? '', { enabled: thisWeekStart !== undefined });

  const documentTitle = `주간 브리핑 ${weekStart}`;
  useDocumentTitle(documentTitle);

  // 주소가 보여 주는 주와 다르면 정리한다(진입·사이드바로 다시 들어옴·기기 시계 물러섬) — 기록을 쌓지 않고 RSC 왕복도 없다.
  // window.history.state(__NA 포함)를 넘겨 Next 동기화를 건너뛰므로 useSearchParams 는 옛 값을 준다(해석이 멱등이라 화면은 같다).
  // 그래서 실제 주소창을 읽는다 — 같은 메뉴로 다시 들어오면 Next 가 week 없는 주소를 쓰고 useSearchParams 는 그대로라, 내비게이션 신호로 다시 본다.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('week') === weekStart) return;
    window.history.replaceState(window.history.state, '', `${BRIEFING_PATH}?week=${weekStart}`);
  }, [navigationParams, weekStart]);

  useEffect(() => {
    if (isAwaitingStepBack) setClockSteppedBack(true);
  }, [isAwaitingStepBack]);

  const [printedAt, setPrintedAt] = useState(() => new Date());
  const { currentMonday } = range;
  const closingWeekStart = closingQuery.data?.weekStart;
  useEffect(() => {
    // 탭을 열어 둔 채(절전·망 끊김 없이) KST 월요일을 넘기면 범위가 낡아 옛 주에 '지난주'가 붙는다 — 창 포커스 다시 받기가 꺼져 있어 저절로는 안 바뀐다.
    // 같은 시계(물러섰으면 물러선 시계)로 이번 주 월요일이 바뀌었을 때만 새로 잡는다. 보던 주는 그대로, 꼬리표·끝 버튼·둘째 구역이 새 범위를 따른다.
    // 부르는 쪽이 flushSync 로 감싼다 — 새 범위를 그린 뒤에 아래 캐시를 버려야 접힌 둘째 구역이 쓰지 않을 요청을 다시 보내지 않는다.
    const retakeRangeOnNewWeek = () => {
      const now = new Date();
      if (briefingWeekRange(clockSteppedBack ? new Date(now.getTime() - WEEK_MS) : now).currentMonday === currentMonday) return false;
      setRangeTakenAt(now);
      setClockSteppedBack(false); // 물러섬은 그 주 경계에서 기기 시계가 앞선 탓이었다 — 새 주에서 다시 판단한다.
      setPinnedWeek({ weekStart, wasLatestWeek: isLatestWeek || (isWeekPinned && pinnedWeek.wasLatestWeek), navigation: navigationParams });
      setNotice(null); // 옛 범위로 정한 알림이다
      return true;
    };
    // 이번 주 모집(키에 주가 없다)과 옛 이번 주 히트맵(이제 지난주 키)은 끝나지 않은 주의 값이다 — 버려서 다시 그릴 때 새로 받게 한다.
    const dropUnfinishedWeekData = () => {
      void queryClient.resetQueries({ queryKey: adminQueryKeys.closingRecruitments() });
      if (closingWeekStart) void queryClient.resetQueries({ queryKey: adminQueryKeys.weeklyFacilityHeatmap(closingWeekStart) });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && flushSync(retakeRangeOnNewWeek)) dropUnfinishedWeekData();
    };
    // 인쇄 버튼·Ctrl+P 모두 — 인쇄 직전에 출력 시각을 그 순간으로 바꾸고, 탭 제목(= PDF 기본 파일 이름)을 다시 세운다.
    // 주를 넘기면 Next 가 레이아웃 제목을 다시 그려 useDocumentTitle 이 쓴 제목을 덮을 수 있다(#1606). 훅과 같은 글자라 떠날 때 훅이 되돌린다.
    // 새 주를 넘긴 탭이면 범위도 새로 잡는다 — 새 데이터를 기다릴 수 없어 인쇄물에는 새 주 알림 줄이 남는다.
    const prepareForPrint = () => {
      document.title = `${documentTitle} | 두잉`;
      const isRangeRetaken = flushSync(() => {
        setPrintedAt(new Date());
        return retakeRangeOnNewWeek();
      });
      if (isRangeRetaken) dropUnfinishedWeekData();
    };
    window.addEventListener('beforeprint', prepareForPrint);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeprint', prepareForPrint);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [documentTitle, clockSteppedBack, currentMonday, weekStart, isLatestWeek, isWeekPinned, pinnedWeek, navigationParams, queryClient, closingWeekStart]);

  const goToWeek = (targetWeek: string) => {
    setNotice(null);
    // 주 넘기기는 기록을 쌓지 않는다(회비 감사 기간 필터 선례).
    router.replace(toRoute(`${BRIEFING_PATH}?week=${targetWeek}`), { scroll: false });
  };

  const isReviewLoading = isAwaitingStepBack || (briefingQuery.data === undefined && !briefingQuery.isError);
  const isPreviousSettled = !isPreviousEnabled || previousQuery.data !== undefined || previousQuery.isError;
  // 인쇄는 첫 구역이 다 그려진 뒤에만 — 이 주가 있어도 전 주를 기다리는 동안은 본문이, 히트맵을 받는 동안은 그 자리가 스켈레톤이다.
  // 이 주·히트맵 실패 문장은 바로 인쇄할 수 있다.
  const isReviewHeatmapLoading = reviewHeatmapQuery.data === undefined && !reviewHeatmapQuery.isError;
  // 둘째 구역도 같다 — 이번 주 모집·이번 주 히트맵을 받는 동안은 스켈레톤이고, 실패 문장은 바로 인쇄할 수 있다. 다른 주에서는 그 구역이 없다.
  const isClosingLoading = isLatestWeek && closingQuery.data === undefined && !closingQuery.isError;
  const isThisWeekHeatmapLoading =
    thisWeekStart !== undefined && thisWeekHeatmapQuery.data === undefined && !thisWeekHeatmapQuery.isError;
  const isPrintPending =
    isReviewLoading ||
    (briefingQuery.data !== undefined && !isPreviousSettled) ||
    isReviewHeatmapLoading ||
    isClosingLoading ||
    isThisWeekHeatmapLoading;

  return (
    <>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-ink">주간 브리핑</h1>
          <p className="mt-1 break-keep text-sm text-charcoal-2">지난주에 접수·처리한 일과 이번 주 일정을 모았어요.</p>
        </div>
        <div className="no-print flex flex-col items-end gap-1">
          <button
            type="button"
            aria-disabled={isPrintPending || undefined}
            onClick={() => {
              if (!isPrintPending) window.print();
            }}
            className={cn('btn btn-secondary btn-sm min-h-11 min-w-[6.5rem] justify-center', isPrintPending && 'cursor-not-allowed opacity-60')}
          >
            {isPrintPending ? '불러오는 중' : '인쇄'}
          </button>
          <p className="text-xs text-charcoal-3">인쇄 창에서 PDF로 저장할 수 있어요</p>
        </div>
      </header>
      <div className="mb-4 hidden print:block">
        <p className="text-lg font-bold text-ink">{`총동연 주간 브리핑 · ${formatWeekRange(weekStart, { withYear: true, withWeekday: true })}`}</p>
        <p className="text-xs text-charcoal-2">
          {`출력 ${PRINTED_AT_FORMAT.format(printedAt)}${isLatestWeek && closingQuery.data ? ` · ${thisWeekBasisText(closingQuery.dataUpdatedAt)}` : ''}`}
        </p>
      </div>
      {isWeekPinned && pinnedWeek.wasLatestWeek ? (
        // 인쇄에도 남긴다 — 열어 둔 탭을 새 주에 그대로 인쇄하면 보던 주가 지난주가 아니게 된 것을 종이에도 적는다.
        <p className="mb-4 break-keep rounded-md bg-graysoft px-3 py-2 text-sm text-charcoal-2">{newWeekStartedText(range.latestWeek, todayIso)}</p>
      ) : null}
      <nav aria-label="바로가기" className="no-print mb-4 flex flex-wrap gap-2">
        <a href="#weekly-review" className="btn btn-ghost btn-sm min-h-11">한 주 돌아보기</a>
        <a href="#this-week" className="btn btn-ghost btn-sm min-h-11">이번 주 챙길 것</a>
      </nav>
      <WeeklyReviewSection
        weekStart={weekStart}
        range={range}
        todayIso={todayIso}
        notice={notice}
        briefing={isAwaitingStepBack ? undefined : briefingQuery.data}
        isLoading={isReviewLoading}
        onRetry={() => void briefingQuery.refetch()}
        previous={isPreviousEnabled ? (previousQuery.data ?? null) : null}
        isPreviousSettled={isPreviousSettled}
        // 받아 둔 전 주가 있으면 다시 받기에 실패해도 그 비교를 그대로 쓴다(끝난 주 숫자) — 알림은 비교를 정말 뺄 때만.
        isPreviousFailed={isPreviousEnabled && previousQuery.isError && previousQuery.data === undefined}
        onRetryPrevious={() => void previousQuery.refetch()}
        onNavigate={goToWeek}
      />
      <ThisWeekSection
        isLatestWeek={isLatestWeek}
        latestWeek={range.latestWeek}
        currentMonday={range.currentMonday}
        todayIso={todayIso}
        onBackToLatest={() => {
          goToWeek(range.latestWeek);
          // 누른 버튼이 둘째 구역과 함께 사라진다 — 화면을 다시 읽기 시작할 첫 구역 제목으로 포커스를 옮긴다.
          document.getElementById('weekly-review-heading')?.focus();
        }}
      />
    </>
  );
}
