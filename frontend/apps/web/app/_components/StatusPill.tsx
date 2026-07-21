// 상태 배지 공용 필 — globals.css 의 .pill 계열(warm/sky/solid/coral/outline)을 그대로 쓴다(목업 SubBadge 동일 어휘).
export function StatusPill({ label, className }: { label: string; className: string }) {
  return <span className={`pill font-bold ${className}`}>{label}</span>;
}
