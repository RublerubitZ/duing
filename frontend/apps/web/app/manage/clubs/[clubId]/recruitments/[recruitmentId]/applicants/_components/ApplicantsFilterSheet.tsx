'use client';

import { useEffect, useState } from 'react';
import type { ApplicantsFilters } from '@duing/types';
import { COLLEGE_DISPLAY_NAME, COLLEGE_OPTIONS, isCollege } from '@duing/types';
import { skipNextOverlayReclaim } from '@/app/_lib/backDismiss';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: ApplicantsFilters;
  onApply: (next: ApplicantsFilters) => void;
};

/**
 * 모바일 보조 필터(단과대·지원 기간) 시트. 상태는 칩이 항상 노출하므로 여기 중복해 넣지 않는다.
 * 시트 안에서는 초안으로 편집하고 "적용" 에서 한 번에 반영한다 — 즉시 반영하면 시트가 열린 채
 * router.replace 가 반복된다. 열 때마다 현재 필터로 초기화한다.
 */
export function ApplicantsFilterSheet({ open, onOpenChange, filters, onApply }: Props) {
  const [draft, setDraft] = useState<ApplicantsFilters>(filters);

  useEffect(() => {
    if (open) setDraft(filters);
  }, [open, filters]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-4 pt-4">
        <SheetHeader>
          <SheetTitle>필터</SheetTitle>
          <SheetDescription className="sr-only">
            단과대와 지원 기간으로 지원자를 거릅니다.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <label className="block text-sm text-charcoal-2">
            단과대
            <select
              value={draft.college ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  college: isCollege(event.target.value) ? event.target.value : undefined,
                })
              }
              className="mt-1.5 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal"
            >
              <option value="">전체</option>
              {COLLEGE_OPTIONS.map((college) => (
                <option key={college} value={college}>
                  {COLLEGE_DISPLAY_NAME[college]}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="text-sm text-charcoal-2">
            <legend className="mb-1.5">지원 기간</legend>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="시작일"
                value={draft.submittedFrom ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, submittedFrom: event.target.value || undefined })
                }
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal"
              />
              <span aria-hidden className="text-charcoal-3">
                ~
              </span>
              <input
                type="date"
                aria-label="종료일"
                value={draft.submittedTo ?? ''}
                onChange={(event) =>
                  setDraft({ ...draft, submittedTo: event.target.value || undefined })
                }
                className="min-w-0 flex-1 rounded-md border border-line bg-paper px-3 py-2 text-sm text-charcoal"
              />
            </div>
          </fieldset>
        </div>

        <div className="mt-6 flex gap-2 pb-2">
          <button
            type="button"
            onClick={() =>
              setDraft({
                ...draft,
                college: undefined,
                submittedFrom: undefined,
                submittedTo: undefined,
              })
            }
            className="btn btn-secondary btn-sm flex-1"
          >
            보조 필터 지우기
          </button>
          <button
            type="button"
            onClick={() => {
              // 닫힘과 이동(router.replace)이 겹치는 자리다. 오버레이 닫힘의 회수 back() 이
              // 방금 적용한 필터 URL 을 되돌려 삼켜, 적용이 통째로 무효가 된다(실브라우저 실측).
              // 닫기 직전에 회수 1회를 건너뛰게 한다 — 알림 시트·콘솔 메뉴와 같은 규약.
              skipNextOverlayReclaim();
              onApply(draft);
              onOpenChange(false);
            }}
            className="btn btn-primary btn-sm flex-1"
          >
            적용
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
