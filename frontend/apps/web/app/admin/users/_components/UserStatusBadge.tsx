import type { UserStatus } from '@duing/types';

const STATUS_STYLE: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: { label: '정상', className: 'bg-sage/10 text-ink' },
  SUSPENDED: { label: '이용 정지', className: 'bg-coral/10 text-coral' },
};

/**
 * 계정 상태 뱃지. 알려진 값일 때만 렌더한다 — 배포 전환기에 status 가 없는 구 백엔드 응답이 오면
 * 뱃지를 생략한다. `status !== 'ACTIVE'` 로 분기하면 그 시기에 전원이 정지로 보인다.
 */
export function UserStatusBadge({ status }: { status?: UserStatus }) {
  const style = status ? STATUS_STYLE[status] : undefined;
  if (!style) return null;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${style.className}`}
    >
      {style.label}
    </span>
  );
}
