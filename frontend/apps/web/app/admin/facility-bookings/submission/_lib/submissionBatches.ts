import type { SubmissionAuditEntry, SubmissionBatchSummary } from '@duing/types';

export type SubmissionBatchStatus = 'REVIEWING' | 'COMPLETED' | 'CANCELLED';

/** 배지 3종 파생 — cancelled/completed 는 BE 행잠금으로 상호 배타(§4.2/4.3). 취소가 우선 표기. */
export function deriveBatchStatus(batch: SubmissionBatchSummary): SubmissionBatchStatus {
  if (batch.cancelled) return 'CANCELLED';
  if (batch.completed) return 'COMPLETED';
  return 'REVIEWING';
}

// badgeClass 는 submission 도메인 기존 팔레트(submissionTimetable.submissionBlockVisual) 톤을 뱃지 필 형태로 옮긴 것 —
// REVIEWING=ink(선택 가능/진행 중 톤), COMPLETED=sage(CONFIRMED 성공 톤), CANCELLED=graysoft(PENDING/취소 회색 톤).
// 두 톤 다 bookingDisplay.BOOKING_STATUS_META(APPROVED/CANCELLED)와도 동일 관례.
export const BATCH_STATUS_META: Record<SubmissionBatchStatus, { label: string; badgeClass: string }> = {
  REVIEWING: { label: '검토 중', badgeClass: 'bg-ink/10 text-ink' },
  COMPLETED: { label: '제출 완료', badgeClass: 'bg-sage/30 text-ink-deep' },
  CANCELLED: { label: '취소됨', badgeClass: 'bg-graysoft text-charcoal-3' },
};

export const AUDIT_ACTION_LABELS: Record<SubmissionAuditEntry['action'], string> = {
  CREATED: '생성',
  CANCELLED: '취소',
  CSV_DOWNLOADED: 'CSV 다운로드',
  VIEWED: '조회',
  COMPLETED: '학교 제출 완료',
};

/** BE 저장 규칙과 동일(FacilitySubmissionBatch: "facility-submission-" + submissionNo + ".csv"). */
export function submissionCsvFileName(submissionNo: string): string {
  return `facility-submission-${submissionNo}.csv`;
}
