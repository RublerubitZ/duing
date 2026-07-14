// 시설명 → 아이콘 매핑(공용). 아이콘은 FE 매핑 — 크롤이 SoT 라 신규 시설은 폴백 아이콘.
const FACILITY_ICON_RULES: [RegExp, string][] = [
  [/커뮤니티룸/, '🛋'],
  [/공동연습실/, '🎸'],
  [/빛광장/, '🎤'],
  [/자유광장/, '🎪'],
  [/웅지관/, '🏛'],
];
const FALLBACK_ICON = '🏢';

export function facilityIcon(roomName: string): string {
  const matched = FACILITY_ICON_RULES.find(([pattern]) => pattern.test(roomName));
  return matched ? matched[1] : FALLBACK_ICON;
}
