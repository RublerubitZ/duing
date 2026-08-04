import { describe, expect, it } from 'vitest';

import {
  APPLICATION_CLOSED_WITHOUT_RESULT_LABEL,
  APPLICATION_STATUS_APPLICANT_LABEL,
} from '@/app/_constants/application-status';
import { FILTERS, STATUS_META, STATUS_TO_FILTER } from '@/app/me/applications/_constants/data';

// 지원자 대면 표기의 단일 기준은 APPLICATION_STATUS_APPLICANT_LABEL (스펙 §5-4).
// 지원현황 화면의 상태 필·필터 탭이 이 상수를 벗어나 자체 문구로 돌아가지 않도록 고정한다.

describe('STATUS_META — 지원자 라벨 SoT 소비', () => {
  it('applied 는 SUBMITTED 라벨(= ON_HOLD 와 동일 표기)을 그대로 쓴다', () => {
    expect(STATUS_META.applied?.label).toBe(APPLICATION_STATUS_APPLICANT_LABEL.SUBMITTED);
    expect(STATUS_META.applied?.label).toBe(APPLICATION_STATUS_APPLICANT_LABEL.ON_HOLD);
  });

  it('interview-pending·passed·failed 는 대응 enum 의 지원자 라벨을 쓴다', () => {
    expect(STATUS_META['interview-pending']?.label).toBe(
      APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING,
    );
    expect(STATUS_META.passed?.label).toBe(APPLICATION_STATUS_APPLICANT_LABEL.ACCEPTED);
    expect(STATUS_META.failed?.label).toBe(APPLICATION_STATUS_APPLICANT_LABEL.REJECTED);
  });

  it('interview-scheduled 는 면접 대상의 sub-state 로 구분 유지된다', () => {
    const scheduled = STATUS_META['interview-scheduled']?.label;
    expect(scheduled).toContain('면접');
    expect(scheduled).not.toBe(APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING);
  });

  it('운영진 전용 표기나 소멸한 서류 단계 용어를 노출하지 않는다', () => {
    for (const meta of Object.values(STATUS_META)) {
      expect(meta.label).not.toContain('서류');
      expect(meta.label).not.toBe('지원 완료');
    }
  });
});

describe('FILTERS — 탭 라벨은 SoT, 매칭 로직은 STATUS_TO_FILTER', () => {
  const labelOf = (key: string) => FILTERS.find((filter) => filter.key === key)?.label;

  it('상태 탭 라벨 4종이 지원자 라벨과 일치한다', () => {
    expect(labelOf('doc')).toBe(APPLICATION_STATUS_APPLICANT_LABEL.SUBMITTED);
    expect(labelOf('intv')).toBe(APPLICATION_STATUS_APPLICANT_LABEL.INTERVIEW_PENDING);
    expect(labelOf('pass')).toBe(APPLICATION_STATUS_APPLICANT_LABEL.ACCEPTED);
    expect(labelOf('fail')).toBe(APPLICATION_STATUS_APPLICANT_LABEL.REJECTED);
    expect(labelOf('all')).toBe('전체');
  });

  it('소멸한 서류심사 탭 문구가 남아 있지 않다', () => {
    expect(FILTERS.map((filter) => filter.label).join()).not.toContain('서류');
  });

  it('모집 마감 × 미결도 전용 탭을 가진다 — 어느 탭에도 안 걸리면 전체 탭 밖에서 사라진다', () => {
    expect(labelOf('closed')).toBe(APPLICATION_CLOSED_WITHOUT_RESULT_LABEL);
    expect(STATUS_TO_FILTER['closed-unresolved']).toBe('closed');
    expect(STATUS_META['closed-unresolved']?.label).toBe(APPLICATION_CLOSED_WITHOUT_RESULT_LABEL);
  });

  it('모든 상태 파생값이 실재하는 탭에 매핑된다', () => {
    // 누락 자체는 STATUS_TO_FILTER 가 Record<AppStatus, FilterKey> 라 컴파일러가 잡는다.
    // 여기서는 매핑된 값이 실제 탭으로 존재하는지(오타·삭제된 키)만 본다.
    const filterKeys = new Set(FILTERS.map((filter) => filter.key));
    for (const filterKey of Object.values(STATUS_TO_FILTER)) {
      expect(filterKeys.has(filterKey)).toBe(true);
    }
  });

  it('상태 → 탭 매칭은 라벨 정리와 무관하게 유지된다', () => {
    expect(STATUS_TO_FILTER.applied).toBe('doc');
    expect(STATUS_TO_FILTER['interview-pending']).toBe('intv');
    expect(STATUS_TO_FILTER['interview-scheduled']).toBe('intv');
    expect(STATUS_TO_FILTER.passed).toBe('pass');
    expect(STATUS_TO_FILTER.failed).toBe('fail');
  });
});
