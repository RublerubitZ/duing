'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useSearchParams } from 'next/navigation';

import { ApiError } from '@duing/api';
import { addDaysIso, useAdminWeeklyBriefingQuery } from '@duing/hooks';
import { kstDateTimeFormatter, todayKstDateString } from '@duing/hooks/datetime';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { useDocumentTitle } from '@/app/_lib/useDocumentTitle';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useHydrated } from '@/app/_lib/useHydrated';
import { LoadingGate } from '@/components/loading/LoadingGate';

import { WeeklyReviewSection } from '../_components/WeeklyReviewSection';
import { briefingWeekRange, resolveRequestedWeek } from '../_lib/briefingWeek';
import { formatWeekRange } from '../_lib/weeklyBriefingPresentation';

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
  const router = useGuardedRouter();
  const [openedAt] = useState(() => new Date());
  // 기기 시계가 앞서 서버가 '아직 끝나지 않은 주'라고 하면 한 주 물러선 시계로 범위를 다시 잡는다 — 한 번만.
  const [clockSteppedBack, setClockSteppedBack] = useState(false);
  const range = briefingWeekRange(clockSteppedBack ? new Date(openedAt.getTime() - WEEK_MS) : openedAt);
  const requestedWeek = searchParams.get('week');
  const weekStart = resolveRequestedWeek(requestedWeek, range).weekStart;
  const [notice, setNotice] = useState(() => resolveRequestedWeek(requestedWeek, range).notice);
  const todayIso = todayKstDateString(openedAt);

  const briefingQuery = useAdminWeeklyBriefingQuery(weekStart, { isLatestWeek: weekStart === range.latestWeek });
  // 가장 이른 주의 전 주는 서버 범위 밖이라 부르지 않고 비교만 뺀다(알림 없음).
  const isPreviousEnabled = weekStart > range.oldestWeek;
  const previousQuery = useAdminWeeklyBriefingQuery(addDaysIso(weekStart, -7), { enabled: isPreviousEnabled });
  const isAwaitingStepBack =
    !clockSteppedBack && briefingQuery.error instanceof ApiError && briefingQuery.error.code === 'WEEK_NOT_ENDED';

  useDocumentTitle(`주간 브리핑 ${weekStart}`);

  // 주소가 보여 주는 주와 다르면 정리한다(진입·사이드바로 다시 들어옴·기기 시계 물러섬) — 기록을 쌓지 않고 RSC 왕복도 없다.
  // window.history.state(__NA 포함)를 넘겨 Next 동기화를 건너뛰므로 useSearchParams 는 옛 값을 준다. 해석이 멱등이라 화면은 같다.
  useEffect(() => {
    if (requestedWeek === weekStart) return;
    window.history.replaceState(window.history.state, '', `${BRIEFING_PATH}?week=${weekStart}`);
  }, [requestedWeek, weekStart]);

  useEffect(() => {
    if (isAwaitingStepBack) setClockSteppedBack(true);
  }, [isAwaitingStepBack]);

  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => {
    // 인쇄 버튼·Ctrl+P 모두 — 인쇄 직전에 출력 시각을 그 순간으로 바꾼다.
    const updatePrintedAt = () => flushSync(() => setPrintedAt(new Date()));
    window.addEventListener('beforeprint', updatePrintedAt);
    return () => window.removeEventListener('beforeprint', updatePrintedAt);
  }, []);

  const goToWeek = (targetWeek: string) => {
    setNotice(null);
    // 주 넘기기는 기록을 쌓지 않는다(회비 감사 기간 필터 선례).
    router.replace(toRoute(`${BRIEFING_PATH}?week=${targetWeek}`), { scroll: false });
  };

  const isReviewLoading = isAwaitingStepBack || (briefingQuery.data === undefined && !briefingQuery.isError);
  const isPreviousSettled = !isPreviousEnabled || previousQuery.data !== undefined || previousQuery.isError;
  // 인쇄는 본문이 그려진 뒤에만 — 이 주가 있어도 전 주를 기다리는 동안은 스켈레톤이다. 이 주 실패 문장은 바로 인쇄할 수 있다.
  const isPrintPending = isReviewLoading || (briefingQuery.data !== undefined && !isPreviousSettled);

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
        <p className="text-xs text-charcoal-2">{`출력 ${PRINTED_AT_FORMAT.format(printedAt)}`}</p>
      </div>
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
        isPreviousFailed={isPreviousEnabled && previousQuery.isError}
        onRetryPrevious={() => void previousQuery.refetch()}
        onNavigate={goToWeek}
      />
    </>
  );
}
