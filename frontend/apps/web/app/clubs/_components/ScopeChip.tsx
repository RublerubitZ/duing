import { BadgeCheck, GraduationCap } from 'lucide-react';

import type { ClubScope } from '../_lib/clubs';

// 중앙/학과 구분 칩 — filled 파스텔로 색만 봐도 구분되게(중앙=세이지 그린, 학과=스카이 블루).
// 두 색 모두 기존 팔레트(sage-mist·pill-sky) 재사용이라 튀지 않는다.
// 아이콘 단독 표기 금지: 처음 보는 사용자도 읽을 수 있게 텍스트를 항상 병기한다.
export function ScopeChip({ scope }: { scope: ClubScope }) {
  const isCentral = scope === '중앙';
  const ScopeIcon = isCentral ? BadgeCheck : GraduationCap;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] text-[10.5px] font-bold ${
        isCentral ? 'bg-sage-mist text-ink-deep' : 'bg-[#DDE8F1] text-[#2F557A]'
      }`}
    >
      <ScopeIcon size={11} aria-hidden />
      {scope}
    </span>
  );
}
