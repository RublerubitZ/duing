import { describe, expect, it } from 'vitest';
import type { SubmissionBatchSummary } from '@duing/types';
import {
  AUDIT_ACTION_LABELS,
  BATCH_STATUS_META,
  batchAgeDays,
  batchFacilityLabel,
  batchTitle,
  defaultBatchMemo,
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

describe('defaultBatchMemo', () => {
  it('오늘 날짜 기준 "M월 N주차 · 동아리명"을 만든다 — 월말(29~31일)은 5주차', () => {
    expect(defaultBatchMemo('밴드부', new Date(2026, 6, 1))).toBe('7월 1주차 · 밴드부');
    expect(defaultBatchMemo('밴드부', new Date(2026, 6, 20))).toBe('7월 3주차 · 밴드부');
    expect(defaultBatchMemo('방송국', new Date(2026, 6, 31))).toBe('7월 5주차 · 방송국');
  });
});

describe('batchTitle', () => {
  it('메모가 있으면 제목, 없거나 공백뿐이면 제출번호가 제목이 된다', () => {
    expect(batchTitle({ memo: '8월 1차 제출', submissionNo: 'SUB-1' })).toBe('8월 1차 제출');
    expect(batchTitle({ memo: null, submissionNo: 'SUB-1' })).toBe('SUB-1');
    expect(batchTitle({ memo: '   ', submissionNo: 'SUB-1' })).toBe('SUB-1');
  });
});

describe('batchAgeDays', () => {
  it('생성 후 경과 일수를 24시간 단위 floor 로 계산하고, 미래·Invalid 입력을 방어한다', () => {
    const now = new Date('2026-07-20T12:00:00+09:00');
    expect(batchAgeDays('2026-07-20T10:00:00+09:00', now)).toBe(0); // 당일
    expect(batchAgeDays('2026-07-17T11:00:00+09:00', now)).toBe(3); // 경고 경계(3일)
    // 미래 시각(시계 오차)은 음수 대신 0 으로 clamp, 파싱 불가 문자열은 null.
    expect(batchAgeDays('2026-07-21T12:00:00+09:00', now)).toBe(0);
    expect(batchAgeDays('not-a-date', now)).toBeNull();
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

describe('batchFacilityLabel', () => {
  it('facilityNames 가 있으면 " · " 로 join 한다 (동아리 단위 v2 §5)', () => {
    expect(
      batchFacilityLabel(makeBatch({ facilityId: null, facilityName: null, facilityNames: ['강당', '세미나실'] })),
    ).toBe('강당 · 세미나실');
  });

  it('facilityNames 결측(구응답)·빈 배열은 facilityName 으로 폴백한다', () => {
    expect(batchFacilityLabel(makeBatch())).toBe('강당');
    expect(batchFacilityLabel(makeBatch({ facilityNames: [] }))).toBe('강당');
  });

  it('facilityName 도 없으면 facilityId 폴백, 둘 다 없으면 - 를 반환한다', () => {
    expect(batchFacilityLabel(makeBatch({ facilityName: null }))).toBe('시설 100');
    expect(batchFacilityLabel(makeBatch({ facilityId: null, facilityName: null }))).toBe('-');
  });
});

describe('submissionCsvFileName', () => {
  it('제출 번호로 BE 저장 규칙과 동일한 CSV 파일명을 만든다', () => {
    expect(submissionCsvFileName('SUB-20260720-001')).toBe('facility-submission-SUB-20260720-001.csv');
  });
});
