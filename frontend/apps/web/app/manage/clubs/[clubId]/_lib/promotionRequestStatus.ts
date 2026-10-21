import { formatDateKst, parseKstInstant } from '@duing/hooks/datetime';
import type { LatestPromotionRequest, PromotionRequestStatus } from '@duing/types';

const PROMOTION_REQUEST_STATUS_LABEL: Record<PromotionRequestStatus, string> = {
  PENDING: '검토 대기 중',
  ACCEPTED: '수락됨',
  REJECTED: '거절됨',
};

// 운영진 콘솔 배지 토큰 규약 — 배경은 토큰/10, 글자는 같은 색의 *.deep(AA 대비).
const PROMOTION_REQUEST_STATUS_BADGE_CLASS: Record<PromotionRequestStatus, string> = {
  PENDING: 'bg-warm/10 text-warm-deep',
  ACCEPTED: 'bg-sage/10 text-sage-deep',
  REJECTED: 'bg-coral/10 text-coral-deep',
};

// 처리 결과 배지를 헤더에 남겨 두는 기간 — 그 뒤 결과는 홍보 요청 모달의 카드에서만 본다.
const HANDLED_BADGE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function promotionRequestStatusChip(status: PromotionRequestStatus): { label: string; badgeClass: string } {
  return { label: PROMOTION_REQUEST_STATUS_LABEL[status], badgeClass: PROMOTION_REQUEST_STATUS_BADGE_CLASS[status] };
}

/** 운영 홈 헤더 배지 문구. 대기 중이면 제출일을 붙이고, 처리 결과는 처리 후 14일 미만일 때만. 그리지 않으면 null. */
export function promotionRequestBadgeText(request: LatestPromotionRequest, now: Date): string | null {
  if (request.status === 'PENDING') {
    return `${PROMOTION_REQUEST_STATUS_LABEL.PENDING} · ${formatDateKst(request.createdAt)} 제출`;
  }
  if (request.handledAt === null) return null;
  const handledAtMs = parseKstInstant(request.handledAt).getTime();
  return now.getTime() < handledAtMs + HANDLED_BADGE_WINDOW_MS ? PROMOTION_REQUEST_STATUS_LABEL[request.status] : null;
}
