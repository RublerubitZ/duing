'use client';

import { useGlobalEventCategoryStatsQuery } from '@duing/hooks';
import type { GlobalEventCategory } from '@duing/types';
import {
  GLOBAL_EVENT_CATEGORY_LABEL,
  GLOBAL_EVENT_CATEGORY_ORDER,
} from '../_lib/categoryLabels';

const OTHER_WARN_THRESHOLD = 0.15;
const NORMAL_BAR_COLOR = 'var(--sage)';
const WARN_BAR_COLOR = '#D97757';

export function AdminGlobalEventCategoryStats() {
  const statsQuery = useGlobalEventCategoryStatsQuery();

  if (statsQuery.isLoading) {
    return (
      <div className="border border-line rounded-lg bg-paper p-5 text-[13px] text-charcoal-3">
        분포를 불러오는 중…
      </div>
    );
  }
  if (statsQuery.isError || !statsQuery.data) {
    return (
      <div className="border border-line rounded-lg bg-paper p-5 text-[13px] text-coral flex items-center justify-between">
        <span>분포를 불러오지 못했습니다.</span>
        <button
          type="button"
          onClick={() => statsQuery.refetch()}
          className="px-3 py-1 rounded-md border border-line text-charcoal-2"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const distribution = statsQuery.data;
  const total = GLOBAL_EVENT_CATEGORY_ORDER.reduce(
    (sum, categoryValue) => sum + (distribution[categoryValue] ?? 0),
    0,
  );
  const otherRatio = total === 0 ? 0 : (distribution.OTHER ?? 0) / total;
  const otherIsAbove = otherRatio >= OTHER_WARN_THRESHOLD;

  return (
    <div className="border border-line rounded-lg bg-paper p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-bold text-ink">카테고리 분포</h2>
        <span className="text-[12px] text-charcoal-3">총 {total}건</span>
      </div>
      <ul className="space-y-2">
        {GLOBAL_EVENT_CATEGORY_ORDER.map((categoryValue) => {
          const count = distribution[categoryValue] ?? 0;
          const ratio = total === 0 ? 0 : count / total;
          const widthPercent = Math.max(2, Math.round(ratio * 100));
          const color = pickBarColor(categoryValue, otherIsAbove);
          return (
            <li key={categoryValue} className="flex items-center gap-3">
              <span className="w-[140px] text-[12.5px] text-charcoal-2">
                {GLOBAL_EVENT_CATEGORY_LABEL[categoryValue]}
              </span>
              <div className="flex-1 h-3 rounded-full bg-cream-2 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${widthPercent}%`, background: color }}
                />
              </div>
              <span className="w-[60px] text-right text-[12.5px] font-mono text-charcoal-2">
                {count}건
              </span>
            </li>
          );
        })}
      </ul>
      {otherIsAbove && (
        <p className="mt-3 text-[12px] text-coral">
          ⚠️ OTHER 비율이 {Math.round(otherRatio * 100)}% 입니다 — 적합한 카테고리 추가 검토가 필요합니다.
        </p>
      )}
    </div>
  );
}

function pickBarColor(categoryValue: GlobalEventCategory, otherIsAbove: boolean): string {
  if (categoryValue === 'OTHER' && otherIsAbove) return WARN_BAR_COLOR;
  return NORMAL_BAR_COLOR;
}
