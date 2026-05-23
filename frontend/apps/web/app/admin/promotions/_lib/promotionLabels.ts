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
