import { parseKstInstant } from '@duing/hooks';
import type { SubmissionAuditEntry, SubmissionBatchSummary } from '@duing/types';

export type SubmissionBatchStatus = 'REVIEWING' | 'COMPLETED' | 'CANCELLED';

/** 배지 3종 파생 — cancelled/completed 는 BE 행잠금으로 상호 배타(§4.2/4.3). 취소가 우선 표기. */
export function deriveBatchStatus(batch: SubmissionBatchSummary): SubmissionBatchStatus {
  if (batch.cancelled) return 'CANCELLED';
  if (batch.completed) return 'COMPLETED';
  return 'REVIEWING';
}

// badgeClass 는 globals.css .pill 변형(목업 SubBadge 매핑): 제출 대기=sky · 제출 완료=solid · 취소=outline.
// REVIEWING 라벨은 '제출 대기' — 검토할 대상이 없는 상태라 '검토 중'은 오독을 부른다(개편 스펙 §1).
export const BATCH_STATUS_META: Record<SubmissionBatchStatus, { label: string; badgeClass: string }> = {
  REVIEWING: { label: '제출 대기', badgeClass: 'pill-sky' },
  COMPLETED: { label: '제출 완료', badgeClass: 'pill-solid' },
  CANCELLED: { label: '취소됨', badgeClass: 'pill-outline' },
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

/** 일괄 생성 메모 프리필(v2 스펙 §4) — "M월 N주차 · 동아리명". 메모는 목록 이름처럼 쓰인다(수정 가능). */
export function defaultBatchMemo(groupName: string, today: Date = new Date()): string {
  const weekOfMonth = Math.ceil(today.getDate() / 7);
  return `${today.getMonth() + 1}월 ${weekOfMonth}주차 · ${groupName}`;
}

/** 목록 제목 승격(개편 스펙 §5·§7) — 메모가 있으면 제목, 없으면 제출번호가 제목이 된다. */
export function batchTitle(batch: Pick<SubmissionBatchSummary, 'memo' | 'submissionNo'>): string {
  return batch.memo !== null && batch.memo.trim() !== '' ? batch.memo : batch.submissionNo;
}

/** 방치 배치 감지(개편 스펙 §5) — 생성 후 경과 일수(24시간 단위 floor). Invalid 입력은 null. */
export function batchAgeDays(submittedAt: string, now: Date = new Date()): number | null {
  const createdAt = parseKstInstant(submittedAt);
  if (Number.isNaN(createdAt.getTime())) return null;
  return Math.floor(Math.max(0, now.getTime() - createdAt.getTime()) / 86_400_000);
}
