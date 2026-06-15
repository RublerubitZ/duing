import { describe, expect, it } from 'vitest';

import {
  APPLICATION_STATUS_APPLICANT_LABEL,
  APPLICATION_STATUS_OPERATOR_LABEL,
} from '@/app/_constants/application-status';

// Spec P0-4 — ApplicationStatus 라벨 매트릭스 (5 enum × 2 audience = 10 라벨).

describe('APPLICATION_STATUS_OPERATOR_LABEL', () => {
  it('SUBMITTED → 지원 완료', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.SUBMITTED).toBe('지원 완료');
  });
  it('UNDER_REVIEW → 서류 검토 중', () => {
    expect(APPLICATION_STATUS_OPERATOR_LABEL.UNDER_REVIEW).toBe('서류 검토 중');
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
  it('SUBMITTED → 지원 완료', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.SUBMITTED).toBe('지원 완료');
  });
  it('UNDER_REVIEW → 서류 검토 중', () => {
    expect(APPLICATION_STATUS_APPLICANT_LABEL.UNDER_REVIEW).toBe('서류 검토 중');
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
