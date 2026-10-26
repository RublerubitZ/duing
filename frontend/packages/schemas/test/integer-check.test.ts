import { describe, it, expect } from 'vitest';
import {
  createCashbookEntrySchema,
  createFeePolicySchema,
  createRecruitmentSchema,
  recordPaymentSchema,
  submitReportSchema,
  updateClubSchema,
  updateRecruitmentSchema,
} from '../src/index';

// 정수 검사는 zod 3 의 .int() 와 같아야 한다. zod 4 의 .int() 는 2^53 을 넘는 정수를 거부하고, 실패하면 같은 회차의
// 객체 단위 refine·superRefine 을 건너뛰어 폼이 한 번에 보여 주던 오류가 다음 제출로 밀린다.
const issuesOf = (result: { error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  result.error?.issues.map((issue) => [issue.path.join('.'), issue.message]) ?? [];

// 2^53(9007199254740992) 을 넘는 정수 — 숫자 입력란 값(z.number)과 문자열로 들어오는 금액·일자(z.coerce) 두 가지로 넣는다.
const BEYOND_SAFE_INTEGER = 1e20;
const BEYOND_SAFE_INTEGER_TEXT = '99999999999999999999';

const recruitmentBase = {
  title: '2026 신입 모집',
  startDate: '2026-11-01',
  endDate: null,
  capacity: 10,
  applicationMode: 'EXTERNAL',
  externalFormUrl: 'https://forms.gle/aBcD1234',
} as const;
const recruitmentUpdateBase = { title: '2026 신입 모집', startDate: '2026-11-01', capacity: 10, useInterview: false };
const clubBase = { description: null, logoUrl: null, coverUrl: null, tags: [], snsLinks: [], faqs: [] };
const policyBase = {
  name: '정기 회비',
  amount: '10000',
  billingType: 'MONTHLY',
  targetType: 'ALL_MEMBERS',
  autoIssue: false,
} as const;
const paymentBase = { amount: '1000', method: 'CASH', paidAt: '2026-10-26' } as const;
const cashbookBase = {
  entryType: 'EXPENSE',
  categoryCode: 'DINING',
  amount: '12000',
  description: 'MT 저녁',
  transactionDate: '2026-10-20',
} as const;

describe('정수 검사 — 소수가 들어와도 교차 검증 문구를 같은 회차에 함께 낸다', () => {
  const autoIssuePolicy = { ...policyBase, autoIssue: true };

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
      ...recruitmentBase,
      capacity: 1.5,
      applicationMode: 'SELF',
      externalFormUrl: undefined,
      questionItems: [],
    });
    expect(issuesOf(result)).toEqual([
      ['capacity', '모집 인원은 정수여야 합니다.'],
      ['questionItems', '자체 폼 모집은 질문을 최소 1개 이상 등록해야 합니다.'],
    ]);
  });
});

// 정수 검사 12곳마다 한 줄 — 상한이 있는 곳은 상한 문구 하나만, 나머지는 통과해야 한다(develop 과 같음).
describe('정수 검사 — 2^53 을 넘는 정수도 정수로 본다(12곳)', () => {
  it.each([
    {
      site: '모집 등록 인원',
      parse: () => createRecruitmentSchema.safeParse({ ...recruitmentBase, capacity: BEYOND_SAFE_INTEGER }),
      expected: [],
    },
    {
      site: '모집 수정 인원',
      parse: () => updateRecruitmentSchema.safeParse({ ...recruitmentUpdateBase, capacity: BEYOND_SAFE_INTEGER }),
      expected: [],
    },
    {
      site: 'FAQ 순서',
      parse: () =>
        updateClubSchema.safeParse({
          ...clubBase,
          faqs: [{ question: '회비가 있나요?', answer: '학기당 2만 원입니다.', order: BEYOND_SAFE_INTEGER }],
        }),
      expected: [],
    },
    {
      site: '창설년도',
      parse: () => updateClubSchema.safeParse({ ...clubBase, foundedYear: BEYOND_SAFE_INTEGER }),
      expected: [['foundedYear', '창설년도가 너무 큽니다.']],
    },
    {
      site: '기수',
      parse: () => updateClubSchema.safeParse({ ...clubBase, cohortNumber: BEYOND_SAFE_INTEGER }),
      expected: [],
    },
    {
      site: '활동 빈도',
      parse: () => updateClubSchema.safeParse({ ...clubBase, activityFrequency: BEYOND_SAFE_INTEGER }),
      expected: [],
    },
    {
      site: '동아리 회비 금액',
      parse: () =>
        updateClubSchema.safeParse({ ...clubBase, feeCycle: 'MONTHLY', membershipFeeAmount: BEYOND_SAFE_INTEGER }),
      expected: [['membershipFeeAmount', '회비 금액이 너무 큽니다.']],
    },
    {
      site: '신고 대상 ID',
      parse: () => submitReportSchema.safeParse({ targetType: 'CLUB', targetId: BEYOND_SAFE_INTEGER, reasonCode: 'SPAM' }),
      expected: [],
    },
    {
      site: '회비 정책 발행일·마감일',
      parse: () => createFeePolicySchema.safeParse({ ...policyBase, issueDay: BEYOND_SAFE_INTEGER_TEXT }),
      expected: [['issueDay', '발행일은 1~28 사이여야 합니다.']],
    },
    {
      site: '회비 정책 금액',
      parse: () => createFeePolicySchema.safeParse({ ...policyBase, amount: BEYOND_SAFE_INTEGER_TEXT }),
      expected: [],
    },
    {
      site: '납부 금액',
      parse: () => recordPaymentSchema.safeParse({ ...paymentBase, amount: BEYOND_SAFE_INTEGER_TEXT }),
      expected: [],
    },
    {
      site: '금전출납부 금액',
      parse: () => createCashbookEntrySchema.safeParse({ ...cashbookBase, amount: BEYOND_SAFE_INTEGER_TEXT }),
      expected: [],
    },
  ])('$site', ({ parse, expected }) => {
    expect(issuesOf(parse())).toEqual(expected);
  });
});

describe('정수 검사 — 소수는 원래 한국어 문구로 거부한다(문구가 있는 6곳)', () => {
  it.each([
    {
      site: '모집 등록 인원',
      parse: () => createRecruitmentSchema.safeParse({ ...recruitmentBase, capacity: 1.5 }),
      expected: [['capacity', '모집 인원은 정수여야 합니다.']],
    },
    {
      site: '모집 수정 인원',
      parse: () => updateRecruitmentSchema.safeParse({ ...recruitmentUpdateBase, capacity: 1.5 }),
      expected: [['capacity', '모집 인원은 정수여야 합니다.']],
    },
    {
      site: '회비 정책 발행일·마감일',
      parse: () => createFeePolicySchema.safeParse({ ...policyBase, issueDay: '1.5' }),
      expected: [['issueDay', '발행일은 정수여야 합니다.']],
    },
    {
      site: '회비 정책 금액',
      parse: () => createFeePolicySchema.safeParse({ ...policyBase, amount: '1.5' }),
      expected: [['amount', '금액은 정수여야 합니다.']],
    },
    {
      site: '납부 금액',
      parse: () => recordPaymentSchema.safeParse({ ...paymentBase, amount: '1.5' }),
      expected: [['amount', '납부 금액은 정수여야 합니다.']],
    },
    {
      site: '금전출납부 금액',
      parse: () => createCashbookEntrySchema.safeParse({ ...cashbookBase, amount: '1.5' }),
      expected: [['amount', '금액은 정수여야 합니다.']],
    },
  ])('$site', ({ parse, expected }) => {
    expect(issuesOf(parse())).toEqual(expected);
  });
});
