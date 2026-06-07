import type { PromotionRenderMode } from '@duing/types';

export const ACTIVE_LABEL: Record<'true' | 'false', string> = {
  true: '활성',
  false: '비활성',
};

export const ACTIVE_BADGE_CLASS: Record<'true' | 'false', string> = {
  true: 'bg-emerald-100 text-emerald-700',
  false: 'bg-graysoft text-charcoal-3',
};

export const CURATION_LABEL = '큐레이션';

export function getActiveBadgeClass(active: boolean): string {
  return ACTIVE_BADGE_CLASS[String(active) as 'true' | 'false'];
}

export function getActiveLabel(active: boolean): string {
  return ACTIVE_LABEL[String(active) as 'true' | 'false'];
}

export type PromotionDisplayStatus = 'LIVE' | 'UPCOMING' | 'EXPIRED' | 'INACTIVE';

export function resolveDisplayStatus(
  active: boolean,
  startAt: string | null,
  endAt: string | null,
  now: Date = new Date(),
): PromotionDisplayStatus {
  if (!active) return 'INACTIVE';
  const nowMs = now.getTime();
  if (endAt !== null && new Date(endAt).getTime() <= nowMs) return 'EXPIRED';
  if (startAt !== null && new Date(startAt).getTime() > nowMs) return 'UPCOMING';
  return 'LIVE';
}

export const DISPLAY_STATUS_LABEL: Record<PromotionDisplayStatus, string> = {
  LIVE: '노출중',
  UPCOMING: '예정',
  EXPIRED: '종료',
  INACTIVE: '비활성',
};

export const DISPLAY_STATUS_BADGE_CLASS: Record<PromotionDisplayStatus, string> = {
  LIVE: 'bg-emerald-100 text-emerald-700',
  UPCOMING: 'bg-sky-100 text-sky-700',
  EXPIRED: 'bg-graysoft text-charcoal-3',
  INACTIVE: 'bg-graysoft text-charcoal-3',
};

export const RENDER_MODE_LABEL: Record<PromotionRenderMode, string> = {
  SYSTEM_COMPOSED: 'SYSTEM',
  FULL_BLEED_IMAGE: 'FULL_BLEED',
};

export const RENDER_MODE_BADGE_CLASS: Record<PromotionRenderMode, string> = {
  SYSTEM_COMPOSED: 'bg-graysoft text-charcoal-3',
  FULL_BLEED_IMAGE: 'bg-ink text-paper',
};
