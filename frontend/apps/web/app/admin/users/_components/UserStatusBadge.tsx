import type { UserStatus } from '@duing/types';

const STATUS_STYLE: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: { label: '정상', className: 'bg-sage/10 text-ink' },
  // 정지는 globals.css 의 pill-coral(#fce2d9 배경 / #9a3f23 글자, 대비 5.47:1)을 그대로 쓴다.
  // text-coral on bg-coral/10 은 2.8:1 이라 11.5px 텍스트가 WCAG AA(4.5:1)에 미달한다.
  SUSPENDED: { label: '이용 정지', className: 'pill-coral' },
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
