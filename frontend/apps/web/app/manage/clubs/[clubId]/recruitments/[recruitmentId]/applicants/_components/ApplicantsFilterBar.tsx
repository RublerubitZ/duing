'use client';

import { useState } from 'react';
import type { ApplicantsFilters, ApplicationStatus } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, COLLEGE_OPTIONS, isCollege } from '@duing/types';
import type { StatusCounts } from '../_lib/applicantCounts';
import { ApplicantsSearchInput } from './ApplicantsSearchInput';
import { ApplicantsFilterSheet } from './ApplicantsFilterSheet';
import { StatusFilterChips } from './StatusFilterChips';

/** 시트에 들어가는 보조 필터 중 적용된 개수. 기간은 시작·종료를 한 덩어리로 센다. */
export function secondaryFilterCount(filters: ApplicantsFilters): number {
  let count = 0;
  if (filters.college) count += 1;
  if (filters.submittedFrom || filters.submittedTo) count += 1;
  return count;
}

type Props = {
  filters: ApplicantsFilters;
  onChange: (next: ApplicantsFilters) => void;
  useInterview: boolean;
  counts: StatusCounts;
};

export function ApplicantsFilterBar({ filters, onChange, useInterview, counts }: Props) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const appliedCount = secondaryFilterCount(filters);
  const hasAnyFilter = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-3">
      {/* 1행 — 검색 + (모바일) 필터 버튼 */}
      <div className="flex items-center gap-2">
        <ApplicantsSearchInput
          defaultValue={filters.q ?? ''}
          onCommit={(committed) =>
            onChange({ ...filters, q: committed === '' ? undefined : committed })
          }
        />
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          aria-label={appliedCount > 0 ? `필터 ${appliedCount}개 적용됨` : '필터'}
          className="btn btn-secondary btn-sm shrink-0 lg:hidden"
        >
          필터
          {appliedCount > 0 && (
            <span aria-hidden className="ml-1 rounded-full bg-ink px-1.5 text-[11px] text-paper">
              {appliedCount}
            </span>
          )}
        </button>
      </div>

      {/* 2행 — 상태 칩 (모바일 가로 스크롤 / 데스크탑 줄바꿈) */}
      <StatusFilterChips
        value={filters.status}
        onChange={(nextStatus: ApplicationStatus | undefined) =>
          onChange({ ...filters, status: nextStatus })
        }
        counts={counts}
        useInterview={useInterview}
      />

      {/* 3행 — 데스크탑 전용 보조 필터 + 초기화(한 벌만 렌더) */}
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-2 lg:flex">
          <select
            value={filters.college ?? ''}
            aria-label="단과대"
            onChange={(event) =>
              onChange({
                ...filters,
                college: isCollege(event.target.value) ? event.target.value : undefined,
              })
            }
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] font-medium text-charcoal-2"
          >
            <option value="">단과대 전체</option>
            {COLLEGE_OPTIONS.map((college) => (
              <option key={college} value={college}>
                {COLLEGE_DISPLAY_NAME[college]}
              </option>
            ))}
          </select>

          <input
            type="date"
            aria-label="시작일"
            value={filters.submittedFrom ?? ''}
            onChange={(event) =>
              onChange({ ...filters, submittedFrom: event.target.value || undefined })
            }
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-charcoal-2"
          />
          <span aria-hidden className="text-charcoal-3">
            ~
          </span>
          <input
            type="date"
            aria-label="종료일"
            value={filters.submittedTo ?? ''}
            onChange={(event) =>
              onChange({ ...filters, submittedTo: event.target.value || undefined })
            }
            className="rounded-full border border-line bg-paper px-3 py-1.5 text-[13px] text-charcoal-2"
          />
        </div>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={() => onChange({})}
            className="btn btn-ghost btn-sm lg:ml-auto"
          >
            필터 초기화
          </button>
        )}
      </div>

      <ApplicantsFilterSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        filters={filters}
        onApply={onChange}
      />
    </div>
  );
}
