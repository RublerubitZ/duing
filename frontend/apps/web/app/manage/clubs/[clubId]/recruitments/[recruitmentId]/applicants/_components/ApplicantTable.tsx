'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import { formatDateTimeKst } from '@duing/hooks';
import type { Applicant } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, GRADE_DISPLAY_NAME } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import {
  APPLICATION_STATUS_BADGE_CLASS,
  APPLICATION_STATUS_LABEL,
  isTerminalApplicationStatus,
} from '@/app/_constants/application-status';
import { ApplicantCheckbox } from './ApplicantCheckbox';

function MyScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-charcoal-3">—</span>;
  // 상태 배지와 같은 하우스 톤 — 표 안에서 두 배지가 다른 색 어휘를 쓰면 시선이 갈린다.
  const toneClass = score >= 4 ? 'pill' : score === 3 ? 'pill pill-outline' : 'pill pill-coral';
  return <span className={cn(toneClass, 'px-2 py-0.5 text-[11px]')}>{score} / 5</span>;
}

type Props = {
  applicants: Applicant[];
  selectedSet: ReadonlySet<number>;
  onToggleSelect: (applicationId: number) => void;
  onOpenDetail: (applicationId: number) => void;
  /** typedRoutes 라 Link 의 href 는 Route 여야 한다 — 페이지가 toRoute 로 만들어 내린다. */
  detailHref: (applicationId: number) => Route;
  useInterview: boolean;
  /** 카드 안 맨 위에 놓이는 일괄 처리 바(ApplicantListToolbar). 전체 선택도 여기 있다. */
  toolbar?: ReactNode;
};

/**
 * 데스크탑(≥1024px) 지원자 표. 1024~1279px 은 콘텐츠 폭이 672~927px 뿐이라
 * Secondary 열(단과대·학번)을 숨기고 xl(1280px) 이상에서만 노출한다(설계 §3).
 * overflow-x-auto 는 최후 방어선으로 남긴다 — 예외적으로 긴 학과명 하나에 페이지가 밀리면 안 된다.
 * 1280px 은 사이드바를 빼면 콘텐츠가 928px 뿐이라 9열이 빡빡하다. 이름·단과대·날짜처럼 식별에 쓰는
 * 값은 nowrap 으로 접힘을 막고(이서아가 "이서/아" 로 갈리면 스캔이 깨진다), 접힘은 가장 긴
 * 학과·학년 한 열에만 허용한다. 좁은 구간에서는 셀 패딩도 함께 줄인다.
 */
export function ApplicantTable({
  applicants,
  selectedSet,
  onToggleSelect,
  onOpenDetail,
  detailHref,
  useInterview,
  toolbar,
}: Props) {
  return (
    /*
     * 툴바는 가로 스크롤 컨테이너 **밖**에 둔다. 안에 두면 (1) 글꼴 확대로 표가 넓어져 가로 스크롤이
     * 생길 때 툴바까지 함께 밀려 잘리고, (2) sticky 를 걸어도 스크롤포트가 이 컨테이너라 화면에
     * 붙지 않는다. 밖으로 빼면 창 스크롤 기준 sticky 가 되어, 긴 목록에서 아래쪽 행을 고른 뒤에도
     * 액션이 화면에 남는다(80명 목록에서 3,400px 를 되올라가야 하던 문제).
     */
    <div className="mt-4 hidden rounded-lg border border-line bg-paper lg:block">
      {toolbar}
      <div className="overflow-x-auto rounded-b-lg">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-graysoft text-left">
          <tr>
            {/* 전체 선택은 카드 안 상단 바(toolbar)가 갖는다 — 헤더에는 자리와 이름만 남긴다. */}
            <th className="w-12 px-3 py-2.5 xl:px-4">
              <span className="sr-only">선택</span>
            </th>
            <th className="whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:px-4">지원자</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:px-4">상태</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:px-4">학과 · 학년</th>
            <th className="hidden whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:table-cell xl:px-4">단과대</th>
            <th className="hidden whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:table-cell xl:px-4">학번</th>
            <th className="whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:px-4">지원일시</th>
            {useInterview && <th className="whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:px-4">면접일정</th>}
            <th className="whitespace-nowrap px-3 py-2.5 text-[11.5px] font-bold tracking-[0.03em] text-charcoal-3 xl:px-4">내 평가</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {applicants.map((applicant) => {
            const isTerminal = isTerminalApplicationStatus(applicant.status);
            const isSelected = selectedSet.has(applicant.applicationId);
            return (
              <tr
                key={applicant.applicationId}
                onClick={() => onOpenDetail(applicant.applicationId)}
                className={cn('cursor-pointer hover:bg-cream/60', isSelected && 'bg-sage-tint')}
              >
                <td className="px-3 py-3 xl:px-4" onClick={(event) => event.stopPropagation()}>
                  {/*
                   * 라벨이 반드시 있어야 한다. 커스텀 외형은 숨긴 input 의 형제 span 이라, 라벨 없이는
                   * 시각 박스를 눌러도 아무 일이 일어나지 않는다(실브라우저에서 확인). 겸사겸사 셀 안
                   * 히트 영역도 넓어진다.
                   */}
                  {/* 음수 마진으로 셀 패딩까지 먹어 44px 을 만든다 — 행 높이는 그대로다(iPad 가로 터치). */}
                  <label className="-my-3 flex w-fit cursor-pointer items-center py-3">
                    <ApplicantCheckbox
                      label={`${applicant.userName} 선택`}
                      checked={isSelected}
                      disabled={isTerminal}
                      onChange={() => onToggleSelect(applicant.applicationId)}
                      title={isTerminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                      className={isTerminal ? 'cursor-not-allowed' : 'cursor-pointer'}
                    />
                  </label>
                </td>
                {/* 이름 링크가 키보드·스크린리더의 상세 진입로다. 행 onClick 과 겹치지 않게 전파를 끊는다. */}
                <td className="whitespace-nowrap px-3 py-3 xl:px-4">
                  <Link
                    href={detailHref(applicant.applicationId)}
                    onClick={(event) => event.stopPropagation()}
                    className="font-semibold text-ink-deep hover:underline"
                  >
                    {applicant.userName}
                  </Link>
                </td>
                <td className="px-3 py-3 xl:px-4">
                  {/* 하우스 배지(.pill) 색을 쓰고 기하만 표 밀도에 맞춰 좁힌다. */}
                  <span
                    className={cn(
                      APPLICATION_STATUS_BADGE_CLASS[applicant.status],
                      'px-2 py-0.5 text-[11px]',
                    )}
                  >
                    {APPLICATION_STATUS_LABEL[applicant.status]}
                  </span>
                </td>
                <td className="px-3 py-3 text-charcoal-2 xl:px-4">
                  {applicant.major} · {GRADE_DISPLAY_NAME[applicant.grade]}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-3 text-charcoal-3 xl:table-cell xl:px-4">
                  {COLLEGE_DISPLAY_NAME[applicant.college]}
                </td>
                <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums text-charcoal-3 xl:table-cell xl:px-4">
                  {applicant.studentId}
                </td>
                <td className="whitespace-nowrap px-3 py-3 tabular-nums text-charcoal-3 xl:px-4">
                  {formatDateTimeKst(applicant.submittedAt)}
                </td>
                {useInterview && (
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-charcoal-3 xl:px-4">
                    {applicant.interviewStartAt
                      ? formatDateTimeKst(applicant.interviewStartAt)
                      : '—'}
                  </td>
                )}
                <td className="px-3 py-3 xl:px-4">
                  <MyScoreBadge score={applicant.myScore} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
