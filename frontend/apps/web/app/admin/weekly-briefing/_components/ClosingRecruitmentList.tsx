import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import {
  isRecruitmentExpiredOpen,
  RECRUITMENT_EXPIRED_OPEN_BADGE,
  RECRUITMENT_EXPIRED_OPEN_LABEL,
} from '@/app/_lib/recruitmentDisplay';
import { toRoute } from '@/app/_lib/route';

import { CLOSING_EMPTY_TEXT, closingEndText } from '../_lib/thisWeekPresentation';

import type { AdminClosingRecruitment } from '@duing/types';

type Props = { recruitments: AdminClosingRecruitment[] };

/** 이번 주 모집 기간이 끝나는 모집 — 종료일 오름차순(서버 순서), 행 전체가 모집 상세 링크 하나. */
export function ClosingRecruitmentList({ recruitments }: Props) {
  return (
    <section aria-labelledby="closing-recruitments-heading">
      <h3 id="closing-recruitments-heading" className="text-sm font-semibold text-charcoal">
        이번 주 모집 기간이 끝나는 모집
      </h3>
      {recruitments.length === 0 ? (
        <p className="mt-2 text-sm text-charcoal-3">{CLOSING_EMPTY_TEXT}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line">
          {recruitments.map((recruitment) => {
            // 만료-OPEN 은 서버가 KST 오늘로 정한 displayStatus 로만 판정한다 — 기기 날짜로 다시 재지 않는다(#896).
            const isEnded = isRecruitmentExpiredOpen(recruitment);
            return (
              <li key={recruitment.recruitmentId} className="print:break-inside-avoid">
                <Link
                  href={toRoute(`/admin/recruitments/${recruitment.recruitmentId}`)}
                  className="flex min-h-11 items-center gap-3 rounded-md px-2 py-2 hover:bg-sage-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-keep text-sm font-medium text-ink">{`${recruitment.clubName} · ${recruitment.title}`}</span>{' '}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-charcoal-2">
                      {isEnded ? <span className={RECRUITMENT_EXPIRED_OPEN_BADGE}>{RECRUITMENT_EXPIRED_OPEN_LABEL}</span> : null}{' '}
                      <span>{closingEndText(recruitment.endDate, isEnded)}</span>{' '}
                      <span>
                        {recruitment.undecidedApplicationCount === null
                          ? '외부 폼'
                          : `결과 안 정한 지원 ${recruitment.undecidedApplicationCount}건`}
                      </span>
                    </span>
                  </span>
                  <ChevronRight size={16} aria-hidden className="no-print shrink-0 text-charcoal-3" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
