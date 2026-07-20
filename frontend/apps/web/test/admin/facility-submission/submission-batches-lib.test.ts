import { describe, expect, it } from 'vitest';
import type { SubmissionBatchSummary } from '@duing/types';
import {
  AUDIT_ACTION_LABELS,
  BATCH_STATUS_META,
  deriveBatchStatus,
  submissionCsvFileName,
} from '../../../app/admin/facility-bookings/submission/_lib/submissionBatches';

function makeBatch(overrides: Partial<SubmissionBatchSummary> = {}): SubmissionBatchSummary {
  return {
    batchId: 1,
    submissionNo: 'SUB-20260720-001',
    facilityId: 100,
    facilityName: '강당',
    bookingCount: 3,
    submittedAt: '2026-07-20T10:00:00',
    submittedByName: '관리자',
    memo: null,
    cancelled: false,
    cancelledAt: null,
    completed: false,
    completedAt: null,
    ...overrides,
  };
}

describe('deriveBatchStatus', () => {
  it('cancelled·completed 모두 false 면 REVIEWING', () => {
    expect(deriveBatchStatus(makeBatch())).toBe('REVIEWING');
  });

  it('completed 면 COMPLETED', () => {
    expect(deriveBatchStatus(makeBatch({ completed: true, completedAt: '2026-07-20T12:00:00' }))).toBe('COMPLETED');
  });

  it('cancelled 면 CANCELLED', () => {
    expect(deriveBatchStatus(makeBatch({ cancelled: true, cancelledAt: '2026-07-20T11:00:00' }))).toBe('CANCELLED');
  });

  it('cancelled·completed 가 동시에 true 면(방어) 취소가 우선한다', () => {
    expect(
      deriveBatchStatus(
        makeBatch({
          cancelled: true,
          cancelledAt: '2026-07-20T11:00:00',
          completed: true,
          completedAt: '2026-07-20T12:00:00',
        }),
      ),
    ).toBe('CANCELLED');
  });
});

describe('BATCH_STATUS_META', () => {
  it('상태 3종 라벨 문구가 고정 문구와 일치한다', () => {
    expect(BATCH_STATUS_META.REVIEWING.label).toBe('제출 대기');
    expect(BATCH_STATUS_META.COMPLETED.label).toBe('제출 완료');
    expect(BATCH_STATUS_META.CANCELLED.label).toBe('취소됨');
  });
});

describe('AUDIT_ACTION_LABELS', () => {
  it('감사 로그 액션 라벨 문구가 고정 문구와 일치한다', () => {
    expect(AUDIT_ACTION_LABELS).toEqual({
      CREATED: '생성',
      CANCELLED: '취소',
      CSV_DOWNLOADED: 'CSV 다운로드',
      VIEWED: '조회',
      COMPLETED: '학교 제출 완료',
    });
  });
});

describe('submissionCsvFileName', () => {
  it('제출 번호로 BE 저장 규칙과 동일한 CSV 파일명을 만든다', () => {
    expect(submissionCsvFileName('SUB-20260720-001')).toBe('facility-submission-SUB-20260720-001.csv');
  });
});
