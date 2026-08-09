'use client';

import type { BulkUpdateApplicationStatusPayload } from '@duing/types';
import { cn } from '@/app/_lib/cn';
import type { SelectAllState } from '../_lib/applicantSelection';
import { ApplicantCheckbox } from './ApplicantCheckbox';

// BulkActionBar 와 같은 계약 — INTERVIEW_PENDING 은 "면접 대상으로 선정" 이 전담한다.
type GenericBulkTarget = Exclude<
  BulkUpdateApplicationStatusPayload['status'],
  'INTERVIEW_PENDING'
>;

type Props = {
  totalCount: number;
  selectableCount: number;
  selectedCount: number;
  state: SelectAllState;
  onToggleAll: () => void;
  onBulkAction: (target: GenericBulkTarget) => void;
  onPromoteToInterview: () => void;
  useInterview: boolean;
  /** 마감된 모집 — 되돌리는 액션(면접 대상 선정·보류)을 감춘다. BulkActionBar 와 동일 규칙. */
  finalizeOnly: boolean;
};

/*
 * 버튼 위계는 DESIGN.md 를 따른다 — 손으로 만들지 않고 `.btn` 계열을 쓰고, hover 는 색상 전환만 둔다.
 *   일괄 합격          primary       잉크. 목록에서 가장 결정적인 액션 하나만 채운다.
 *   면접 대상으로 선정  secondary     파이프라인을 앞으로 미는 보조 액션.
 *   보류               ghost         "일단 세워둔다" — 가장 조용해야 한다.
 *   일괄 불합격         danger-quiet  되돌릴 수 없지만 솔리드로 외칠 자리는 아니다.
 */
/**
 * 데스크탑(≥1024px) 표 카드 안 상단 바 — 전체 선택·선택 수·일괄 액션·총원을 한 줄에 둔다.
 * 표와 붙어 있어 "무엇을 고르고 있는지" 와 "무엇을 할 수 있는지" 가 같은 시야에 들어온다.
 *
 * 모바일은 이 바를 쓰지 않는다 — 좁은 폭에서 액션 4개가 한 줄에 들어가지 않아, 화면 하단 고정
 * 바(BulkActionBar)와 목록 위 전체 선택 줄(SelectAllBar)이 그 역할을 나눠 맡는다.
 */
export function ApplicantListToolbar({
  totalCount,
  selectableCount,
  selectedCount,
  state,
  onToggleAll,
  onBulkAction,
  onPromoteToInterview,
  useInterview,
  finalizeOnly,
}: Props) {
  const hasSelection = selectedCount > 0;

  return (
    <div
      role="region"
      aria-label="지원자 목록 도구 모음"
      className={cn(
        'flex items-center gap-3 border-b border-line px-4 py-3 transition-colors',
        hasSelection && 'bg-sage-tint',
      )}
    >
      <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-bold text-ink-deep">
        <ApplicantCheckbox
          checked={state === 'all'}
          indeterminate={state === 'partial'}
          disabled={selectableCount === 0}
          label="전체 선택"
          onChange={onToggleAll}
        />
        {hasSelection ? `${selectedCount}명 선택됨` : '전체 선택'}
      </label>

      {hasSelection && (
        <div className="flex items-center gap-1.5">
          {useInterview && !finalizeOnly && (
            <button
              type="button"
              onClick={onPromoteToInterview}
              className="btn btn-secondary btn-sm"
            >
              면접 대상으로 선정
            </button>
          )}
          {!finalizeOnly && (
            <button
              type="button"
              onClick={() => onBulkAction('ON_HOLD')}
              className="btn btn-ghost btn-sm"
            >
              보류
            </button>
          )}
          <button
            type="button"
            onClick={() => onBulkAction('REJECTED')}
            className="btn btn-danger-quiet btn-sm"
          >
            일괄 불합격
          </button>
          <button
            type="button"
            onClick={() => onBulkAction('ACCEPTED')}
            className="btn btn-primary btn-sm"
          >
            일괄 합격
          </button>
        </div>
      )}

      <span className="ml-auto shrink-0 text-xs tabular-nums text-charcoal-3">
        총 {totalCount}명
      </span>
    </div>
  );
}
