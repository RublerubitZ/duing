'use client';

// 모바일 전용(md:hidden) 하단 고정 지원 바 — 상세 페이지의 주 행동(지원하기)을 항상 노출한다.
// 이 페이지에선 전역 하단 탭바(BottomNav)가 숨고(matchTabHref 가 /clubs/{id} 를 null 처리) 이 바가 그 자리를 차지한다.
// 지원 동작은 데스크탑 모집 카드와 동일한 useClubApply 로 공유한다. 데스크탑(md+)에선 렌더되지 않는다.

import Link from 'next/link';

import type { MyClubMembership, StudentRecruitmentProjection } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '@/app/_lib/route';
import { ArrowRight } from '@/components/duing/Icon';
import { Spinner } from '@/components/loading/Spinner';
import { ddayLabel } from '../../../_lib/dday';
import { recruitmentDaysLeft } from '../../../_lib/recruitmentDisplay';
import { useClubApply } from '../_lib/useClubApply';

type Props = {
  /** 진행 중인 모집(없으면 undefined). 모집중·예정·상시·마감 모두 받아 처리한다. */
  recruitment: StudentRecruitmentProjection | undefined;
  /** 뷰어의 이 동아리 소속. undefined = 비로그인·로딩(모름), null = 비소속, 객체 = 소속. */
  membership?: MyClubMembership | null;
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
      // 마감 당일은 'D-day'(ddayLabel SSOT). 음수 구간은 카운트다운 없이 '모집중' 으로 폴백한다.
      return {
        top: daysLeft !== null && daysLeft >= 0 ? `모집중 · ${ddayLabel(daysLeft)}` : '모집중',
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

export function ClubDetailApplyBar({ recruitment, membership }: Props) {
  const { canApply, handleApply, applyButtonLabel, isCheckingEligibility, existingApplicationId } =
    useClubApply(recruitment);
  const { top, main } = barLabels(recruitment);
  // 부원 모집에 이미 소속된 뷰어는 서버가 409 로 거절한다 — 누르기 전에 잠근다. 운영진 모집은 반대로 소속이어야 한다.
  const isAlreadyMember = membership != null && recruitment?.targetRole === 'MEMBER';

  return (
    <>
      {/* 고정 바 높이만큼 스크롤 여유 (모바일 전용) */}
      <div aria-hidden className="h-[calc(4.75rem+env(safe-area-inset-bottom))] md:hidden" />
      <div
        data-bottom-bar
        className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-line bg-cream/95 px-[18px] pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] font-body backdrop-blur md:hidden">
        <div className="min-w-0">
          <div className="text-[12px] text-charcoal-3">{top}</div>
          <div className="truncate text-sm font-bold text-ink">{main}</div>
        </div>
        {existingApplicationId !== null && !isAlreadyMember ? (
          // 이미 지원한 모집 — 서버가 409 로 막는 버튼 대신 제출한 지원서로 보낸다. 소속 잠금이 있으면 그 안내가 우선이다.
          <Link
            href={toRoute(`/me/applications/${existingApplicationId}`)}
            className="btn btn-secondary flex-1 rounded-[14px] py-3.5 text-[15px]"
          >
            지원 완료 · 지원서 보기
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply || isCheckingEligibility || isAlreadyMember}
            className={cn(
              'btn btn-primary flex-1 rounded-[14px] py-3.5 text-[15px]',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {isCheckingEligibility ? (
              <span role="status" aria-label="지원 자격 확인 중" className="inline-flex items-center">
                <Spinner size={14} />
              </span>
            ) : isAlreadyMember ? (
              '이미 소속된 동아리예요'
            ) : (
              applyButtonLabel
            )}
            {canApply && !isCheckingEligibility && !isAlreadyMember && <ArrowRight size={16} />}
          </button>
        )}
      </div>
    </>
  );
}
