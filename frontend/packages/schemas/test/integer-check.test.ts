import { describe, it, expect } from 'vitest';
import { createFeePolicySchema, createRecruitmentSchema, updateClubSchema } from '../src/index';

// 정수 검사는 zod 3 의 .int() 와 같아야 한다. zod 4 의 .int() 는 2^53 을 넘는 정수를 거부하고, 실패하면 같은 회차의
// 객체 단위 refine·superRefine 을 건너뛰어 폼이 한 번에 보여 주던 오류가 다음 제출로 밀린다.
const issuesOf = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => [issue.path.join('.'), issue.message]);

describe('정수 검사 — 소수가 들어와도 교차 검증 문구를 같은 회차에 함께 낸다', () => {
  const autoIssuePolicy = {
    name: '정기 회비',
    amount: '10000',
    billingType: 'MONTHLY',
    targetType: 'ALL_MEMBERS',
    autoIssue: true,
  } as const;

  it('회비 정책 금액이 1.5 이고 자동 발행의 발행일·마감일이 비면 세 문구를 모두 낸다', () => {
    expect(issuesOf(createFeePolicySchema.safeParse({ ...autoIssuePolicy, amount: '1.5' }))).toEqual([
      ['amount', '금액은 정수여야 합니다.'],
      ['issueDay', '발행일을 입력해 주세요.'],
      ['dueDay', '마감일을 입력해 주세요.'],
    ]);
  });

  it('회비 정책 발행일이 1.5 이고 마감일이 비면 두 문구를 모두 낸다', () => {
    expect(issuesOf(createFeePolicySchema.safeParse({ ...autoIssuePolicy, issueDay: '1.5', dueDay: '' }))).toEqual([
      ['issueDay', '발행일은 정수여야 합니다.'],
      ['dueDay', '마감일을 입력해 주세요.'],
    ]);
  });

  it('모집 인원이 1.5 이고 자체 폼 질문이 없으면 두 문구를 모두 낸다', () => {
    const result = createRecruitmentSchema.safeParse({
      title: '2026 신입 모집',
      startDate: '2026-11-01',
      endDate: null,
      capacity: 1.5,
      applicationMode: 'SELF',
      questionItems: [],
    });
    expect(issuesOf(result)).toEqual([
      ['capacity', '모집 인원은 정수여야 합니다.'],
      ['questionItems', '자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.'],
    ]);
  });
});

describe('정수 검사 — 2^53 을 넘는 정수도 정수로 본다', () => {
  const clubBase = { description: null, logoUrl: null, coverUrl: null, tags: [], snsLinks: [], faqs: [] };

  it('동아리 회비 금액 1e20 은 상한 문구 하나만 낸다', () => {
    expect(issuesOf(updateClubSchema.safeParse({ ...clubBase, feeCycle: 'MONTHLY', membershipFeeAmount: 1e20 }))).toEqual([
      ['membershipFeeAmount', '회비 금액이 너무 큽니다.'],
    ]);
  });

  it('동아리 기수 1e20 은 통과한다', () => {
    expect(updateClubSchema.safeParse({ ...clubBase, cohortNumber: 1e20 }).success).toBe(true);
  });
});
