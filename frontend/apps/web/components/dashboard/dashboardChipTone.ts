import { STALE_WAITING_DAYS } from '@duing/hooks';

// 배지 deep 토큰 대비 규약 — 토큰/10·/20 배경엔 *.deep 글자. 토큰 쌍 대비는 test/a11y/deep-token-contrast 가 고정한다.
export type DashboardChipTone = 'late' | 'soon' | 'info';

export const DASHBOARD_CHIP_TONE_CLASS: Record<DashboardChipTone, string> = {
  late: 'bg-coral/10 text-coral-deep',
  soon: 'bg-warm/20 text-warm-deep',
  info: 'bg-graysoft text-charcoal-2',
};

// 사흘째부터 주의 — 일주일(STALE_WAITING_DAYS) 전에 한 번 눈에 띄게.
const WAITING_SOON_DAYS = 3;

/** 기다린 날 수 → 칩 톤. 두 콘솔(총동연 대기열·운영진 업무 큐) 공용. */
export const waitingDaysTone = (days: number): DashboardChipTone =>
  days >= STALE_WAITING_DAYS ? 'late' : days >= WAITING_SOON_DAYS ? 'soon' : 'info';
