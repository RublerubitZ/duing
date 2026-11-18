import { Lock } from 'lucide-react';

/** 총동연 전용 관리 항목 표시 — 잠금 아이콘 포함 읽기 전용 (§6.1 목업 Locked Input). */
export function LockedInput({ value }: { value: string }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-[8px] border border-line bg-cream px-3 py-2.5 text-[14px] font-semibold text-charcoal-2">
      <span className="min-w-0 flex-1 truncate">{value}</span>
      <Lock aria-label="총동연 관리 항목" className="h-3.5 w-3.5 shrink-0 text-charcoal-3" />
    </div>
  );
}
