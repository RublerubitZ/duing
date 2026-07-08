'use client';

// 모바일 전용(md:hidden) 하단 고정 지원 바 — 상세 페이지의 주 행동(지원하기)을 항상 노출한다.
// 이 페이지에선 전역 하단 탭바(BottomNav)가 숨고(matchTabHref 가 /clubs/{id} 를 null 처리) 이 바가 그 자리를 차지한다.
// 지원 동작은 데스크탑 모집 카드와 동일한 useClubApply 로 공유한다. 데스크탑(md+)에선 렌더되지 않는다.

import type { StudentRecruitmentProjection } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { ArrowRight } from '@/components/duing/Icon';
import { recruitmentDaysLeft } from '../../../_lib/recruitmentDisplay';
import { useClubApply } from '../_lib/useClubApply';

type Props = {
  /** 진행 중인 모집(없으면 undefined). 모집중·예정·상시·마감 모두 받아 처리한다. */
  recruitment: StudentRecruitmentProjection | undefined;
};

// 바 좌측 2줄 라벨 — 상단은 상태/카운트다운, 하단은 강조 문구.
function barLabels(recruitment: StudentRecruitmentProjection | undefined): {
  top: string;
  main: string;
} {
  if (!recruitment) return { top: '모집 정보', main: '현재 모집이 없어요' };
  switch (recruitment.displayStatus) {
    case 'OPEN': {
      const daysLeft = recruitmentDaysLeft(recruitment.endDate);
      return {
        top: daysLeft !== null ? `모집중 · D-${daysLeft}` : '모집중',
        main: `${recruitment.capacity}명 모집중`,
      };
    }
    case 'ALWAYS_OPEN':
      return { top: '상시모집', main: `${recruitment.capacity}명 모집중` };
    case 'UPCOMING':
      return { top: '모집 예정', main: `${recruitment.startDate} 시작` };
    case 'CLOSED':
      return { top: '모집 마감', main: '이번 모집은 종료됐어요' };
  }
}

export function ClubDetailApplyBar({ recruitment }: Props) {
  const { canApply, handleApply, applyButtonLabel, isCheckingEligibility } =
    useClubApply(recruitment);
  const { top, main } = barLabels(recruitment);

  return (
    <>
      {/* 고정 바 높이만큼 스크롤 여유 (모바일 전용) */}
      <div aria-hidden className="h-[calc(4.75rem+env(safe-area-inset-bottom))] md:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-cream/95 px-[18px] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] font-body backdrop-blur md:hidden">
        <div className="min-w-0">
          <div className="text-[10.5px] text-charcoal-3">{top}</div>
          <div className="truncate text-sm font-bold text-ink">{main}</div>
        </div>
        <button
          type="button"
          onClick={handleApply}
          disabled={!canApply || isCheckingEligibility}
          className={cn(
            'btn btn-primary flex-1 rounded-[14px] py-3.5 text-[15px]',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          {isCheckingEligibility ? '확인 중…' : applyButtonLabel}
          {canApply && !isCheckingEligibility && <ArrowRight size={16} />}
        </button>
      </div>
    </>
  );
}
