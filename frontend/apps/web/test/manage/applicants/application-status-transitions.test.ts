import { describe, expect, it } from 'vitest';

import {
  allowedTransitionsFrom,
  closedRecruitmentTransitionsFrom,
  getStatusTransitions,
} from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/applicationStatusTransitions';

// 스펙 §1-2 — 백엔드 Application.isAllowedTransition 과 완전 동형이어야 한다.
// BE 표가 바뀌면 이 테스트가 먼저 깨지도록 전이표 전체를 리터럴로 고정한다.

describe('getStatusTransitions — 면접 모집 (useInterview=true)', () => {
  it('SUBMITTED → 면접 대상 / 보류 / 불합격 (합격 직행 불가)', () => {
    expect(getStatusTransitions('SUBMITTED', true)).toEqual([
      'INTERVIEW_PENDING',
      'ON_HOLD',
      'REJECTED',
    ]);
  });

  it('ON_HOLD → 면접 대상 / 불합격 (합격 직행 불가·보류 자기전이 없음)', () => {
    expect(getStatusTransitions('ON_HOLD', true)).toEqual(['INTERVIEW_PENDING', 'REJECTED']);
  });

  it('INTERVIEW_PENDING → 합격 / 불합격', () => {
    expect(getStatusTransitions('INTERVIEW_PENDING', true)).toEqual(['ACCEPTED', 'REJECTED']);
  });
});

describe('getStatusTransitions — 비면접 모집 (useInterview=false)', () => {
  it('SUBMITTED → 합격 / 보류 / 불합격 (면접 대상 없음)', () => {
    expect(getStatusTransitions('SUBMITTED', false)).toEqual(['ACCEPTED', 'ON_HOLD', 'REJECTED']);
  });

  it('ON_HOLD → 합격 / 불합격', () => {
    expect(getStatusTransitions('ON_HOLD', false)).toEqual(['ACCEPTED', 'REJECTED']);
  });

  it('어떤 상태에서도 INTERVIEW_PENDING 으로 전이할 수 없다', () => {
    const reachable = (['SUBMITTED', 'ON_HOLD', 'INTERVIEW_PENDING'] as const).flatMap((status) =>
      getStatusTransitions(status, false),
    );
    expect(reachable).not.toContain('INTERVIEW_PENDING');
  });
});

describe('getStatusTransitions — 최종 상태', () => {
  it.each([true, false])('ACCEPTED / REJECTED 는 useInterview=%s 에서도 전이 대상이 없다', (useInterview) => {
    expect(getStatusTransitions('ACCEPTED', useInterview)).toEqual([]);
    expect(getStatusTransitions('REJECTED', useInterview)).toEqual([]);
  });
});

describe('allowedTransitionsFrom', () => {
  it('getStatusTransitions 에 위임한다 (단일 진실)', () => {
    expect(allowedTransitionsFrom('SUBMITTED', true)).toEqual(getStatusTransitions('SUBMITTED', true));
    expect(allowedTransitionsFrom('ON_HOLD', false)).toEqual(getStatusTransitions('ON_HOLD', false));
  });
});

// 마감(CLOSED) 모집 전이표 — 백엔드 Application.isClosedFinalizingTransition 과 동형.
// 렌더링 테스트는 두 출발 상태만 간접 고정하므로, 전 상태를 여기서 리터럴로 못박는다.
describe('closedRecruitmentTransitionsFrom — 마감 후 최종 결과 확정만', () => {
  it.each(['SUBMITTED', 'ON_HOLD', 'INTERVIEW_PENDING'] as const)(
    '아직 결과가 없는 %s 는 합격·불합격만 남는다',
    (status) => {
      expect(closedRecruitmentTransitionsFrom(status)).toEqual(['ACCEPTED', 'REJECTED']);
    },
  );

  it.each(['ACCEPTED', 'REJECTED'] as const)('이미 결과가 난 %s 는 전이 대상이 없다', (status) => {
    expect(closedRecruitmentTransitionsFrom(status)).toEqual([]);
  });

  it('면접 모집이라도 면접 대상 단계를 요구하지 않는다 — 마감 후엔 라운드를 열 수 없다', () => {
    expect(closedRecruitmentTransitionsFrom('SUBMITTED')).toContain('ACCEPTED');
    expect(closedRecruitmentTransitionsFrom('SUBMITTED')).not.toContain('INTERVIEW_PENDING');
  });
});
