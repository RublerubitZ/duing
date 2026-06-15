'use client';

import type { ReactNode } from 'react';
import type { ApplicantsFilters, ApplicationStatus, College } from '@duing/types';
import { COLLEGE_DISPLAY_NAME } from '@duing/types';
import { APPLICATION_STATUS_LABEL } from '../../../../../../../_constants/application-status';
import { ApplicantsSearchInput } from './ApplicantsSearchInput';

const COLLEGE_OPTIONS = (Object.entries(COLLEGE_DISPLAY_NAME) as [College, string][]).map(
  ([value, label]) => ({ value, label }),
);

type Props = {
  filters: ApplicantsFilters;
  onChange: (next: ApplicantsFilters) => void;
  useInterview: boolean;
};

export function ApplicantsFilterBar({ filters, onChange, useInterview }: Props) {
  const updateFilter = (patch: Partial<ApplicantsFilters>) =>
    onChange({ ...filters, ...patch });

  const resetFilters = () => onChange({});

  return (
    <div className="flex flex-wrap items-end gap-3 rounded border border-neutral-200 p-3 bg-white">
      <FilterField label="상태">
        <select
          value={filters.status ?? ''}
          onChange={(event) =>
            updateFilter({
              status:
                event.target.value === ''
                  ? undefined
                  : (event.target.value as ApplicationStatus),
            })
          }
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
          aria-label="상태"
        >
          <option value="">전체</option>
          <option value="SUBMITTED">{APPLICATION_STATUS_LABEL.SUBMITTED}</option>
          <option value="UNDER_REVIEW">{APPLICATION_STATUS_LABEL.UNDER_REVIEW}</option>
          {useInterview && (
            <option value="INTERVIEW_PENDING">
              {APPLICATION_STATUS_LABEL.INTERVIEW_PENDING}
            </option>
          )}
          <option value="ACCEPTED">{APPLICATION_STATUS_LABEL.ACCEPTED}</option>
          <option value="REJECTED">{APPLICATION_STATUS_LABEL.REJECTED}</option>
        </select>
      </FilterField>

      <FilterField label="단과대">
        <select
          value={filters.college ?? ''}
          onChange={(event) =>
            updateFilter({
              college:
                event.target.value === '' ? undefined : (event.target.value as College),
            })
          }
          className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
        >
          <option value="">전체</option>
          {COLLEGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField label="기간">
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={filters.submittedFrom ?? ''}
            onChange={(event) =>
              updateFilter({ submittedFrom: event.target.value || undefined })
            }
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            aria-label="시작일"
          />
          <span className="text-neutral-500">~</span>
          <input
            type="date"
            value={filters.submittedTo ?? ''}
            onChange={(event) =>
              updateFilter({ submittedTo: event.target.value || undefined })
            }
            className="rounded border border-neutral-300 px-2 py-1.5 text-sm"
            aria-label="종료일"
          />
        </div>
      </FilterField>

      <FilterField label="검색">
        <ApplicantsSearchInput
          defaultValue={filters.q ?? ''}
          onCommit={(committed) =>
            updateFilter({ q: committed === '' ? undefined : committed })
          }
        />
      </FilterField>

      <button
        type="button"
        onClick={resetFilters}
        className="ml-auto rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        필터 초기화
      </button>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-600">
      {label}
      {children}
    </label>
  );
}
