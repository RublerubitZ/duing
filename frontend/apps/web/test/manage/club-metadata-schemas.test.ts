import { describe, expect, it } from 'vitest';

import {
  createRecruitmentSchema,
  updateClubSchema,
  updateRecruitmentSchema,
} from '@duing/schemas';

describe('updateClubSchema — 메타 필드 검증', () => {
  const validBase = {
    name: '테스트동아리',
    category: 'ACADEMIC',
    division: null,
    description: null,
    logoUrl: null,
    coverUrl: null,
    tags: [],
    snsLinks: [],
    faqs: [],
  } as const;

  it('foundedYear 가 1900 미만이면 검증 실패한다', () => {
    const result = updateClubSchema.safeParse({ ...validBase, foundedYear: 1800 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('창설년도');
    }
  });

  it('contactEmail 이 잘못된 형식이면 검증 실패한다', () => {
    const result = updateClubSchema.safeParse({ ...validBase, contactEmail: 'not-an-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('이메일');
    }
  });

  it('contactEmail 빈 문자열은 허용된다', () => {
    const result = updateClubSchema.safeParse({ ...validBase, contactEmail: '' });
    expect(result.success).toBe(true);
  });

  it('activityFrequency 가 0 이하이면 검증 실패한다', () => {
    const result = updateClubSchema.safeParse({ ...validBase, activityFrequency: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('활동 빈도');
    }
  });

  it('유효한 메타 필드 조합은 통과한다', () => {
    const result = updateClubSchema.safeParse({
      ...validBase,
      foundedYear: 2018,
      cohortNumber: 10,
      location: '학생회관 405호',
      contactEmail: 'club@daegu.ac.kr',
      activityFrequency: 2,
      activeDays: ['WEDNESDAY', 'FRIDAY'],
      membershipFee: '학기당 30,000원',
    });
    expect(result.success).toBe(true);
  });
});

describe('createRecruitmentSchema — 면접 일정 검증', () => {
  const validBase = {
    title: '테스트모집',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    capacity: 10,
    applicationMode: 'EXTERNAL' as const,
    externalFormUrl: 'https://example.com/form',
    useInterview: false,
  };

  it('면접 시작일이 종료일보다 늦으면 검증 실패한다', () => {
    const result = createRecruitmentSchema.safeParse({
      ...validBase,
      interviewStartDate: '2026-06-05',
      interviewEndDate: '2026-06-03',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('면접');
    }
  });

  it('면접 시작일만 있고 종료일이 없으면 검증 통과한다', () => {
    const result = createRecruitmentSchema.safeParse({
      ...validBase,
      interviewStartDate: '2026-06-01',
    });
    expect(result.success).toBe(true);
  });

  it('면접 일정이 둘 다 없으면 검증 통과한다', () => {
    const result = createRecruitmentSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });
});

describe('updateRecruitmentSchema — 면접 일정 검증', () => {
  const validBase = {
    title: '수정된모집',
    startDate: '2026-05-01',
    endDate: '2026-05-31',
    capacity: 10,
    useInterview: true,
  };

  it('면접 종료일이 시작일보다 빠르면 검증 실패한다', () => {
    const result = updateRecruitmentSchema.safeParse({
      ...validBase,
      interviewStartDate: '2026-06-10',
      interviewEndDate: '2026-06-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain('면접');
    }
  });

  it('면접 일정 페어가 유효하면 검증 통과한다', () => {
    const result = updateRecruitmentSchema.safeParse({
      ...validBase,
      interviewStartDate: '2026-06-01',
      interviewEndDate: '2026-06-03',
      showApplicantCount: true,
    });
    expect(result.success).toBe(true);
  });
});
