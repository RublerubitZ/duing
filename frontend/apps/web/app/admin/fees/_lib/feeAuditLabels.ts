/**
 * 회비 감사 콘솔의 라벨·배지 단일 출처. 목록·상세·감사 로그·이상징후·의견 화면이 모두 여기서만 읽는다.
 * 같은 이벤트가 화면마다 다른 낱말로 보이면 감사 기록을 대조할 수 없다.
 */

import type { AdminFeeMatchType, FeeAnomalySeverity, FeeAuditCommentStatus } from '@duing/types';

const AMOUNT_FORMATTER = new Intl.NumberFormat('ko-KR');

/** 금액은 통화 기호 없이 자릿수만 끊는다 — 화면에서 '원'을 따로 붙인다. */
export function formatFeeAmount(amount: number): string {
  return AMOUNT_FORMATTER.format(amount);
}

export const FEE_EVENT_TYPE_LABEL: Record<string, string> = {
  FEE_POLICY_CREATED: '정책 생성',
  FEE_POLICY_UPDATED: '정책 수정',
  FEE_POLICY_DELETED: '정책 삭제',
  FEE_BILL_ISSUED: '청구 발행',
  FEE_BILL_CANCELLED: '청구 취소',
  FEE_PAYMENT_RECORDED: '납부 기록',
  FEE_PAYMENT_VOIDED: '납부 정정',
  FEE_TX_MANUAL_MATCHED: '수동 매칭',
  FEE_TX_IGNORED: '거래 무시',
  FEE_TX_UNMATCHED: '매칭 취소',
  FEE_ACCOUNT_REGISTERED: '계좌 등록',
  FEE_ACCOUNT_UPDATED: '계좌 변경',
  FEE_ACCOUNT_DELETED: '계좌 삭제',
  FEE_ADMIN_DETAIL_VIEWED: '감사 열람',
  FEE_ADMIN_CSV_DOWNLOADED: 'CSV 다운로드',
};

/**
 * 라벨 맵에 없는 이벤트는 원문 코드를 그대로 보여준다.
 * 서버가 이벤트 종류를 먼저 늘려도 감사 기록이 빈칸으로 사라지지 않게 한다 —
 * 읽기 어려운 코드가 남는 편이 "무언가 일어났는데 무엇인지 모르는" 화면보다 낫다.
 */
export function feeEventTypeLabel(eventType: string): string {
  return FEE_EVENT_TYPE_LABEL[eventType] ?? eventType;
}

export const FEE_SEVERITY_LABEL: Record<FeeAnomalySeverity, string> = {
  INFO: '참고',
  WARNING: '주의',
  HIGH: '경고',
  CRITICAL: '심각',
};

/**
 * 심각도 배지. 대비를 확보한 globals.css 의 pill-* 를 쓴다 —
 * `text-{색}` on `bg-{색}/10` 조합은 11.5px 글자에서 WCAG AA 에 미달한다(UserStatusBadge 선례).
 */
export const FEE_SEVERITY_BADGE_CLASS: Record<FeeAnomalySeverity, string> = {
  INFO: 'bg-graysoft text-charcoal-2',
  WARNING: 'pill-warm',
  HIGH: 'pill-coral',
  CRITICAL: 'bg-danger text-paper',
};

export const FEE_COMMENT_STATUS_LABEL: Record<FeeAuditCommentStatus, string> = {
  OPEN: '진행중',
  IN_REVIEW: '확인중',
  RESOLVED: '완료',
};

export const FEE_MATCH_TYPE_LABEL: Record<AdminFeeMatchType, string> = {
  AUTO: '자동',
  MANUAL: '수동',
  DIRECT: '수기',
};
