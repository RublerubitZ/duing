// 상태 배지 공용 필 — 예약(BookingStatusBadge)·제출 배치 배지가 같은 형태를 공유한다(시설 콘솔 개편 스펙 §1).
export function StatusPill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${className}`}>
      {label}
    </span>
  );
}
