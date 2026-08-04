import { describe, it, expect } from 'vitest';
import type { ApplicantInterviewPhase } from '@duing/types';
import { getInterviewPhaseGuide } from '@/app/me/applications/[applicationId]/_utils/interviewPhaseGuide';

// phase 전수 매핑 — 신 phase 추가 시 여기서 컴파일 에러로 누락 감지.
describe('getInterviewPhaseGuide', () => {
  it('NOT_APPLICABLE → null', () => {
    expect(getInterviewPhaseGuide('NOT_APPLICABLE')).toBeNull();
  });

  it('WAITING_ROUND → stepIndex 1, 회차 대기 문구', () => {
    const guide = getInterviewPhaseGuide('WAITING_ROUND');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(1);
    expect(guide!.title).toBe('면접 회차 대기');
    expect(guide!.description).toBeTruthy();
  });

  it('WAITING_NEXT_ROUND → stepIndex 1, 다음 회차 대기 문구', () => {
    const guide = getInterviewPhaseGuide('WAITING_NEXT_ROUND');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(1);
    expect(guide!.title).toBe('다음 회차 대기');
    expect(guide!.description).toBeTruthy();
  });

  it('AVAILABILITY_REQUESTED → stepIndex 1, 가능 시간 선택 안내', () => {
    const guide = getInterviewPhaseGuide('AVAILABILITY_REQUESTED');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(1);
    expect(guide!.title).toBe('가능 시간 선택');
    expect(guide!.description).toBeTruthy();
  });

  it('AVAILABILITY_CLOSED → stepIndex 1, 제출 마감 안내', () => {
    const guide = getInterviewPhaseGuide('AVAILABILITY_CLOSED');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(1);
    expect(guide!.title).toBe('제출 마감');
    expect(guide!.description).toBeTruthy();
  });

  it('RESPONDED → stepIndex 1, 응답 완료 안내', () => {
    const guide = getInterviewPhaseGuide('RESPONDED');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(1);
    expect(guide!.title).toBe('응답 완료');
    expect(guide!.description).toBeTruthy();
  });

  it('NO_SLOT_REPORTED → stepIndex 1, 조율 요청됨 안내', () => {
    const guide = getInterviewPhaseGuide('NO_SLOT_REPORTED');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(1);
    expect(guide!.title).toBe('조율 요청됨');
    expect(guide!.description).toBeTruthy();
  });

  it('SCHEDULING → stepIndex 1, 배정 검토 중 안내', () => {
    const guide = getInterviewPhaseGuide('SCHEDULING');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(1);
    expect(guide!.title).toBe('배정 검토 중');
    expect(guide!.description).toBeTruthy();
  });

  it('SCHEDULED → stepIndex 2, 일정 확정 안내', () => {
    const guide = getInterviewPhaseGuide('SCHEDULED');
    expect(guide).not.toBeNull();
    expect(guide!.stepIndex).toBe(2);
    expect(guide!.title).toBe('일정 확정');
    expect(guide!.description).toBeTruthy();
  });

  it('모든 non-null guide 에 title·description 이 non-empty 문자열이다', () => {
    const phases: ApplicantInterviewPhase[] = [
      'WAITING_ROUND', 'WAITING_NEXT_ROUND',
      'AVAILABILITY_REQUESTED', 'AVAILABILITY_CLOSED', 'RESPONDED',
      'NO_SLOT_REPORTED', 'SCHEDULING', 'SCHEDULED',
    ];
    for (const phase of phases) {
      const guide = getInterviewPhaseGuide(phase);
      expect(guide, `guide for ${phase} should not be null`).not.toBeNull();
      expect(guide!.title.length, `${phase} title should be non-empty`).toBeGreaterThan(0);
      expect(guide!.description.length, `${phase} description should be non-empty`).toBeGreaterThan(0);
    }
  });
});
