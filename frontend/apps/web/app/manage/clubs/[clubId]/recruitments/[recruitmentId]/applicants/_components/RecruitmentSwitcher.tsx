'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { Check, ChevronDown } from 'lucide-react';
import { useClubRecruitmentsQuery } from '@duing/hooks';
import { toRoute } from '@/app/_lib/route';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { sortPastRecruitments } from '../../../../_lib/sortPastRecruitments';

type RecruitmentSwitcherProps = {
  clubId: number;
  currentRecruitmentId: number;
  /**
   * 전환 목록에서 현재 모집을 못 찾았을 때 헤더에 남길 모집 제목 — 페이지가 상세 쿼리로 이미 들고 있다.
   * 상세가 로딩 중이면 페이지 자체가 LoadingGate 라 제목이 빈 채로 그려지는 창은 없다.
   */
  fallbackTitle: string;
};

/**
 * 지원현황 헤더의 모집 전환 드롭다운(스펙 §3) — 진행 중 / 지난 모집 2그룹.
 *
 * 그룹 기준은 raw status(읽기 전용 관점) — 마감일이 지났어도 수동 마감 전이면 심사 중이라
 * "진행 중"이다(§1-2). 모집 관리 목록도 #894 로 같은 raw 기준이 되어 이제 두 표면의 기준이 일치한다.
 * 외부 폼 모집은 지원자 관리 자체가 없어 전환 대상에서 제외한다.
 *
 * 이동은 next/link — 탭 내비 전례대로 View Transition 을 태우지 않는다.
 */
export function RecruitmentSwitcher({
  clubId,
  currentRecruitmentId,
  fallbackTitle,
}: RecruitmentSwitcherProps) {
  const recruitmentsQuery = useClubRecruitmentsQuery(Number.isNaN(clubId) ? undefined : clubId);
  const switchableRecruitments = (recruitmentsQuery.data ?? []).filter(
    (recruitment) => recruitment.applicationMode === 'SELF',
  );
  const currentRecruitment = switchableRecruitments.find(
    (recruitment) => recruitment.id === currentRecruitmentId,
  );

  // 목록 로딩·실패·캐시 미스·현재 모집이 외부 폼이면 전환 UI 를 걷는다 — 제목 없는 트리거나 현재 모집이
  // 빠진 목록을 보이느니 드롭다운만 포기한다(fail-open). 다만 헤더에서 어떤 모집을 보고 있는지까지
  // 사라지면 안 되므로 제목은 정적 텍스트로 남긴다(외부 폼 모집 직접 접근이 상시 이 경로).
  if (currentRecruitment === undefined) {
    return (
      <span className="max-w-[220px] truncate text-sm font-bold text-ink-deep">{fallbackTitle}</span>
    );
  }

  const groups = [
    {
      label: '진행 중',
      // 백엔드 정렬(OPEN 우선·startDate desc)을 그대로 써 최신 모집이 위에 온다.
      recruitments: switchableRecruitments.filter((recruitment) => recruitment.status === 'OPEN'),
      closed: false,
    },
    {
      label: '지난 모집',
      recruitments: sortPastRecruitments(
        switchableRecruitments.filter((recruitment) => recruitment.status === 'CLOSED'),
      ),
      closed: true,
    },
  ].filter((group) => group.recruitments.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`모집 전환 — 현재 ${currentRecruitment.title}`}
          className="flex min-w-0 items-center gap-1.5 rounded-xl border border-line bg-paper px-3 py-1.5 text-left motion-safe:transition-colors hover:bg-cream/60"
        >
          <span className="max-w-[220px] truncate text-sm font-bold text-ink-deep">
            {currentRecruitment.title}
          </span>
          <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-charcoal-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
        {groups.map((group, groupIndex) => (
          <Fragment key={group.label}>
            {groupIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="py-1.5 text-xs font-bold text-charcoal-3">
              {group.label}
            </DropdownMenuLabel>
            {group.recruitments.map((recruitment) => (
              <DropdownMenuItem key={recruitment.id} asChild className="gap-2">
                <Link
                  href={toRoute(
                    `/manage/clubs/${clubId}/recruitments/${recruitment.id}/applicants`,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">
                    {recruitment.title}
                  </span>
                  {group.closed && (
                    <span className="shrink-0 rounded-full bg-graysoft px-1.5 py-px text-[10px] font-bold text-charcoal-3">
                      마감
                    </span>
                  )}
                  {recruitment.id === currentRecruitmentId && (
                    <>
                      <Check aria-hidden className="h-4 w-4 shrink-0 text-ink" />
                      <span className="sr-only">현재 선택됨</span>
                    </>
                  )}
                </Link>
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
