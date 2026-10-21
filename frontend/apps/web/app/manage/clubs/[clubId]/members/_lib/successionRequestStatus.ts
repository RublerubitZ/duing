import { formatDateKst, parseKstInstant } from '@duing/hooks/datetime';
import type { LatestLeaderSuccessionRequest, SuccessionStatus } from '@duing/types';

const SUCCESSION_REQUEST_STATUS_LABEL: Record<SuccessionStatus, string> = {
  PENDING: '검토 대기 중',
  APPROVED: '승인됨',
  REJECTED: '거절됨',
};

// 운영진 콘솔 배지 토큰 규약 — 배경은 토큰/10, 글자는 같은 색의 *.deep(AA 대비).
const SUCCESSION_REQUEST_STATUS_BADGE_CLASS: Record<SuccessionStatus, string> = {
  PENDING: 'bg-warm/10 text-warm-deep',
  APPROVED: 'bg-sage/10 text-sage-deep',
  REJECTED: 'bg-coral/10 text-coral-deep',
};

// 처리 결과 배지를 헤더에 남겨 두는 기간 — 그 뒤 결과는 승계 요청 모달의 카드에서만 본다.
const HANDLED_BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function successionRequestStatusChip(status: SuccessionStatus): { label: string; badgeClass: string } {
  return { label: SUCCESSION_REQUEST_STATUS_LABEL[status], badgeClass: SUCCESSION_REQUEST_STATUS_BADGE_CLASS[status] };
}

/**
 * 부원 관리 헤더 배지 문구. 대기 중이면 제출일을 붙이고, 처리 결과는 처리 후 14일 미만일 때만. 그리지 않으면 null.
 * 승계 요청 버튼이 없는 사용자(승인돼 회장이 된 요청자)에게는 "승인됨"만 — 대기·거절은 붙일 버튼이 없다.
 */
export function successionRequestBadgeText(
  request: LatestLeaderSuccessionRequest,
  now: Date,
  canRequestSuccession: boolean,
): string | null {
  if (!canRequestSuccession && request.status !== 'APPROVED') return null;
  if (request.status === 'PENDING') {
    return `${SUCCESSION_REQUEST_STATUS_LABEL.PENDING} · ${formatDateKst(request.createdAt)} 제출`;
  }
  if (request.handledAt === null) return null;
  const handledAtMs = parseKstInstant(request.handledAt).getTime();
  return now.getTime() < handledAtMs + HANDLED_BADGE_WINDOW_MS ? SUCCESSION_REQUEST_STATUS_LABEL[request.status] : null;
}
