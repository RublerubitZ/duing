'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { formatDateKst } from '@duing/hooks';
import type { Applicant } from '@duing/types';
import { GRADE_DISPLAY_NAME } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import {
  APPLICATION_STATUS_LABEL,
  isTerminalApplicationStatus,
} from '@/app/_constants/application-status';
import { STATUS_BADGE_CLASS, STATUS_STRIPE_CLASS } from '../_lib/applicantStatus';

/**
 * 목록 전용 축약 — `2026.05.01` → `05.01`. 좁은 2행에서 연도는 모집 기간이 이미 말해준다.
 * 포맷터가 원문을 그대로 돌려준 경우(잘못된 입력)는 자르지 않는다.
 */
function toMonthDay(iso: string): string {
  const formatted = formatDateKst(iso);
  return /^\d{4}\.\d{2}\.\d{2}$/.test(formatted) ? formatted.slice(5) : formatted;
}

type Props = {
  applicants: Applicant[];
  selectedSet: ReadonlySet<number>;
  onToggleSelect: (applicationId: number) => void;
  onOpenDetail: (applicationId: number) => void;
  /** typedRoutes 라 Link 의 href 는 Route 여야 한다 — 페이지가 toRoute 로 만들어 내린다. */
  detailHref: (applicationId: number) => Route;
};

/**
 * 모바일·태블릿(≤1023px) 지원자 목록 — 2줄 dense list.
 * 단과대·면접 일정·평가 점수는 여기서 생략하고 표와 상세에서 본다(설계 §4).
 */
export function ApplicantCardList({
  applicants,
  selectedSet,
  onToggleSelect,
  onOpenDetail,
  detailHref,
}: Props) {
  return (
    <div className="mt-4 space-y-2 lg:hidden">
      {applicants.map((applicant) => {
        const isTerminal = isTerminalApplicationStatus(applicant.status);
        const isSelected = selectedSet.has(applicant.applicationId);
        return (
          <div
            key={applicant.applicationId}
            data-applicant-card
            onClick={() => onOpenDetail(applicant.applicationId)}
            className={cn(
              'card cursor-pointer border-l-4 p-3 transition',
              STATUS_STRIPE_CLASS[applicant.status],
              // 선택 표시는 배경만 바꾼다 — border-sage 를 주면 왼쪽 상태 띠 색을 덮어쓴다.
              isSelected && 'bg-cream/60',
            )}
          >
            <div className="flex items-start gap-0.5">
              {/*
               * 선택 영역과 카드 이동 영역을 분리한다(PR #939). 음수 마진은 카드 padding(12) 에
               * 왼쪽 테두리(4) 를 더한 값이라 44px 이 카드 바깥 모서리부터 시작한다.
               * 최종 상태 카드는 전파를 끊지 않고, 비활성 체크박스도 pointer-events 를 꺼
               * 탭이 카드까지 내려가 상세로 진입한다.
               * 주의: 라벨 클릭은 input 으로 포워딩됐다 되돌아와 onClick 이 2회 실행된다 —
               * 부수효과 있는 로직을 얹지 말 것(토글은 onChange 가 1회만 받는다).
               */}
              <label
                onClick={isTerminal ? undefined : (event) => event.stopPropagation()}
                className="-my-3 -ml-4 grid h-11 w-11 shrink-0 place-items-center"
              >
                <input
                  type="checkbox"
                  aria-label={`${applicant.userName} 선택`}
                  checked={isSelected}
                  disabled={isTerminal}
                  onChange={() => onToggleSelect(applicant.applicationId)}
                  title={isTerminal ? '최종 상태인 지원자는 선택할 수 없습니다.' : undefined}
                  className="h-4 w-4 rounded border-line text-ink focus:ring-sage disabled:pointer-events-none disabled:opacity-50"
                />
              </label>

              <div className="min-w-0 flex-1">
                {/* 1행 — 이름·학년·상태. 이름 링크가 키보드·스크린리더의 유일한 상세 진입로다. */}
                <div className="flex items-center gap-1.5">
                  <Link
                    href={detailHref(applicant.applicationId)}
                    onClick={(event) => event.stopPropagation()}
                    className="min-w-0 truncate text-[14px] font-semibold leading-5 text-ink-deep hover:underline"
                  >
                    {applicant.userName}
                  </Link>
                  <span className="shrink-0 text-[12px] leading-5 text-charcoal-3">
                    {GRADE_DISPLAY_NAME[applicant.grade]}
                  </span>
                  <span
                    className={cn(
                      'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4',
                      STATUS_BADGE_CLASS[applicant.status],
                    )}
                  >
                    {APPLICATION_STATUS_LABEL[applicant.status]}
                  </span>
                </div>

                {/* 2행 — 학과·학번·평가 여부·지원일 */}
                <div className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-4 text-charcoal-3">
                  <span className="min-w-0 truncate">{applicant.major}</span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0 tabular-nums">{applicant.studentId}</span>
                  {/*
                   * 평가 표식과 지원일을 오른쪽 한 덩어리로 묶는다. 표식을 왼쪽 텍스트 사이에 두면
                   * 구분자 `·` 와 섞여 무엇의 표식인지 읽히지 않는다.
                   * 색은 text-ink — sage(#9DB6A0)는 흰 배경 대비 2.1:1 로 부족하다.
                   */}
                  <span className="ml-auto flex shrink-0 items-center gap-1">
                    {applicant.myScore !== null && (
                      <span
                        role="img"
                        aria-label="내 평가 작성됨"
                        className="text-[9px] leading-4 text-ink"
                      >
                        ●
                      </span>
                    )}
                    <span className="tabular-nums">{toMonthDay(applicant.submittedAt)}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
