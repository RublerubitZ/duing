// 배지 deep 토큰 대비 규약 — 토큰/10·/20 배경엔 *.deep 글자. 토큰 쌍 대비는 test/a11y/deep-token-contrast 가 고정한다.
export type DashboardChipTone = 'late' | 'soon' | 'info';

export const DASHBOARD_CHIP_TONE_CLASS: Record<DashboardChipTone, string> = {
  late: 'bg-coral/10 text-coral-deep',
  soon: 'bg-warm/20 text-warm-deep',
  info: 'bg-graysoft text-charcoal-2',
};
