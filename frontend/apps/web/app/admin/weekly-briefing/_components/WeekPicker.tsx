'use client';

import { useId } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { addDaysIso } from '@duing/hooks';

import { cn } from '@/app/_lib/cn';

import { OLDEST_WEEK_TEXT, nextWeekUnavailableText, screenWeekRange } from '../_lib/weeklyBriefingPresentation';

import type { ReactNode } from 'react';
import type { BriefingWeekRange } from '../_lib/briefingWeek';

type Props = {
  weekStart: string;
  range: BriefingWeekRange;
  todayIso: string;
  onNavigate: (weekStart: string) => void;
};

/** 주 넘기기 — 끝의 버튼은 disabled 대신 aria-disabled 로 포커스를 남기고 클릭을 무시한다(옆 이유 글을 설명으로 잇는다). */
export function WeekPicker({ weekStart, range, todayIso, onNavigate }: Props) {
  const previousWeek = addDaysIso(weekStart, -7);
  const nextWeek = addDaysIso(weekStart, 7);
  const isOldest = weekStart <= range.oldestWeek;
  const isLatest = weekStart >= range.latestWeek;
  const previousReasonId = useId();
  const nextReasonId = useId();
  return (
    <div className="no-print flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <WeekButton
          accessibleName={`이전 주 보기, ${screenWeekRange(previousWeek, todayIso, false)}`}
          isUnavailable={isOldest}
          describedBy={isOldest ? previousReasonId : undefined}
          onSelect={() => onNavigate(previousWeek)}
        >
          <ChevronLeft size={16} aria-hidden />
          이전 주
        </WeekButton>
        <WeekButton
          accessibleName={`다음 주 보기, ${screenWeekRange(nextWeek, todayIso, false)}`}
          isUnavailable={isLatest}
          describedBy={isLatest ? nextReasonId : undefined}
          onSelect={() => onNavigate(nextWeek)}
        >
          다음 주
          <ChevronRight size={16} aria-hidden />
        </WeekButton>
      </div>
      {isLatest ? (
        <p id={nextReasonId} className="break-keep text-xs text-charcoal-3">
          {nextWeekUnavailableText(range.currentMonday)}
        </p>
      ) : null}
      {isOldest ? (
        <p id={previousReasonId} className="break-keep text-xs text-charcoal-3">
          {OLDEST_WEEK_TEXT}
        </p>
      ) : null}
    </div>
  );
}

function WeekButton({
  accessibleName,
  isUnavailable,
  describedBy,
  onSelect,
  children,
}: {
  accessibleName: string;
  isUnavailable: boolean;
  describedBy: string | undefined;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={accessibleName}
      aria-disabled={isUnavailable || undefined}
      aria-describedby={describedBy}
      onClick={() => {
        if (!isUnavailable) onSelect();
      }}
      className={cn('btn btn-secondary btn-sm inline-flex min-h-11 items-center gap-1', isUnavailable && 'cursor-not-allowed opacity-50')}
    >
      {children}
    </button>
  );
}
