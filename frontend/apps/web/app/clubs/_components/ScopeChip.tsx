import { BadgeCheck, GraduationCap } from 'lucide-react';

import type { ClubScope } from '../_lib/clubs';

// 중앙/학과 구분 칩 — 상태가 아닌 "속성"이라 중립 아웃라인으로 절제한다(컬러 칩은 모집 상태 전용).
// 아이콘 단독 표기 금지: 처음 보는 사용자도 읽을 수 있게 텍스트를 항상 병기한다.
export function ScopeChip({ scope }: { scope: ClubScope }) {
  const ScopeIcon = scope === '중앙' ? BadgeCheck : GraduationCap;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-transparent px-2 py-[3px] text-[10.5px] font-semibold text-charcoal-2">
      <ScopeIcon size={11} aria-hidden />
      {scope}
    </span>
  );
}
