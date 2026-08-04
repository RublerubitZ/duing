import { describe, expect, it } from 'vitest';

import {
  APPLICATION_STATUS_APPLICANT_LABEL,
  APPLICATION_STATUS_OPERATOR_LABEL,
} from '@/app/_constants/application-status';

// Spec §5-4 — ApplicationStatus 라벨 매트릭스 (5 enum × 2 audience = 10 라벨).

describe('APPLICATION_STATUS_OPERATOR_LABEL', () => {
  it('SUBMITTED → 지원 완료', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED).toBe('지원 완료');
  });
  it('ON_HOLD → 보류', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.ON_HOLD).toBe('보류');
  });
  it('INTERVIEW_PENDING → 면접 대상', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.INTERVIEW_PENDING).toBe('면접 대상');
  });
  it('ACCEPTED → 합격', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.ACCEPTED).toBe('합격');
  });
  it('REJECTED → 불합격', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.REJECTED).toBe('불합격');
  });
});

describe('APPLICATION_STATUS_APPLICANT_LABEL', () => {
  it('SUBMITTED → 심사 중', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.SUBMITTED).toBe('심사 중');
  });
  it('ON_HOLD → 심사 중', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.ON_HOLD).toBe('심사 중');
  });
  it('보류는 지원자에게 노출되지 않는다 — SUBMITTED 와 동일 표기 (스펙 §1-1)', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.ON_HOLD).toBe(
      APPLICATION_STATUS_APPLICANT_LABEL.SUBMITTED,
    );
  });
  it('운영진 라벨은 보류를 구분해 노출한다', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.ON_HOLD).not.toBe(
      APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED,
    );
  });
  it('INTERVIEW_PENDING → 면접 대상', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING).toBe('면접 대상');
  });
  it('ACCEPTED → 최종 합격', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.ACCEPTED).toBe('최종 합격');
  });
  it('REJECTED → 최종 불합격', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.REJECTED).toBe('최종 불합격');
  });
});
