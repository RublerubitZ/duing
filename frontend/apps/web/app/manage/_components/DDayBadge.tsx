'use client';

import type { RecruitmentSummary } from '@duing/types';
import { CLOSING_SOON_DAYS, daysUntilKst } from '@duing/hooks';

/** 마감일 D-day 뱃지 — 임박(D-0~D-3)은 coral pill 강조, 그 외는 muted 텍스트. 상시모집·마감·경과는 미표시 */
export function DDayBadge({ recruitment, now }: { recruitment: RecruitmentSummary; now: Date }) {
  if (recruitment.displayStatus === 'CLOSED' || recruitment.displayStatus === 'ALWAYS_OPEN') return null;
  if (!recruitment.endDate) return null;
  const daysLeft = daysUntilKst(recruitment.endDate, now);
  if (daysLeft < 0) return null;
  const label = daysLeft === 0 ? 'D-day' : `D-${daysLeft}`;
  if (daysLeft <= CLOSING_SOON_DAYS) {
    return <span className="pill pill-coral ml-2 shrink-0">{label}</span>;
  }
  return <span className="ml-2 shrink-0 text-xs text-charcoal-3">{label}</span>;
}
