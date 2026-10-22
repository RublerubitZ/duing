import { afterEach, describe, it, expect, vi } from 'vitest';
import { createRecruitmentSchema, updateRecruitmentSchema } from '../src/index';

// BE GeneralRecruitmentService 와 같은 규칙: 생성은 과거 종료일 차단, 수정은 기존 과거
// 종료일 재전송(만료-OPEN 편집)이 정당해 스키마 차원에서 막지 않는다(변경 여부는 BE 판정).
// 날짜는 한국 시간 기준 — 스키마의 오늘 계산과 같은 방식으로 만들어 자정 경계 플레이크를 피한다.
const KST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' });
function kstIsoDate(daysFromToday: number): string {
  return KST_DATE.format(new Date(Date.now() + daysFromToday * 86_400_000));
}

function createPayload(overrides: Record<string, unknown>) {
  return {
    title: '2026 신입 모집',
    startDate: kstIsoDate(0),
    endDate: kstIsoDate(7),
    capacity: 10,
    // SELF 는 "질문 1개 이상" refine 이 따로 걸린다 — 이 파일의 관심사는 날짜 규칙뿐이라 외부 폼으로 고정.
    applicationMode: 'EXTERNAL',
    externalFormUrl: 'https://forms.gle/aBcD1234',
    ...overrides,
  };
}

describe('createRecruitmentSchema — 과거 종료일 차단', () => {
  it('종료일이 어제인 모집은 거부되고 한국어 안내가 실린다', () => {
    const result = createRecruitmentSchema.safeParse(
      createPayload({ startDate: kstIsoDate(-3), endDate: kstIsoDate(-1) }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === '모집 종료일은 오늘 이후여야 합니다.')).toBe(true);
    }
  });

  it('종료일이 오늘인 모집은 오늘 하루 지원을 받으므로 허용된다', () => {
    const result = createRecruitmentSchema.safeParse(
      createPayload({ startDate: kstIsoDate(-3), endDate: kstIsoDate(0) }),
    );

    expect(result.success).toBe(true);
  });

  it('시작일이 과거여도 종료일이 미래면 허용된다 — 이미 진행 중인 모집의 뒤늦은 등록 경로', () => {
    const result = createRecruitmentSchema.safeParse(
      createPayload({ startDate: kstIsoDate(-5), endDate: kstIsoDate(7) }),
    );

    expect(result.success).toBe(true);
  });

  it('상시모집(endDate null)은 종료일 규칙의 대상이 아니다', () => {
    const result = createRecruitmentSchema.safeParse(createPayload({ endDate: null }));

    expect(result.success).toBe(true);
  });
});

describe('updateRecruitmentSchema — 만료-OPEN 편집 경로 보호', () => {
  it('기존 과거 종료일을 그대로 재전송하는 수정은 스키마가 막지 않는다', () => {
    const result = updateRecruitmentSchema.safeParse({
      title: '심사 중 제목 수정',
      startDate: kstIsoDate(-10),
      endDate: kstIsoDate(-3),
      capacity: 10,
      useInterview: false,
    });

    expect(result.success).toBe(true);
  });
});

// 폼은 경로별 **첫** issue 만 보여준다 — 빈 값에 형식 오류가 먼저 잡히면 "날짜 형식이 올바르지
// 않습니다" 라는 헛다리 안내가 나간다. min 이 regex 앞에 있어야 하는 이유가 이것뿐이다.
function firstMessage(issues: { path: PropertyKey[]; message: string }[], field: string) {
  return issues.find((issue) => issue.path[0] === field)?.message;
}

describe('빈 날짜 — 형식 오류가 아니라 미입력 안내', () => {
  it('생성: 시작일·종료일이 비면 입력을 청하는 문구가 먼저 나온다', () => {
    const result = createRecruitmentSchema.safeParse(createPayload({ startDate: '', endDate: '' }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstMessage(result.error.issues, 'startDate')).toBe('시작일을 입력해 주세요.');
      expect(firstMessage(result.error.issues, 'endDate')).toBe('종료일을 입력해 주세요.');
    }
  });

  it('수정: 시작일·종료일이 비면 입력을 청하는 문구가 먼저 나온다', () => {
    const result = updateRecruitmentSchema.safeParse({
      title: '제목',
      startDate: '',
      endDate: '',
      capacity: 10,
      useInterview: false,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(firstMessage(result.error.issues, 'startDate')).toBe('시작일을 입력해 주세요.');
      expect(firstMessage(result.error.issues, 'endDate')).toBe('종료일을 입력해 주세요.');
    }
  });
});

// 오늘은 기기 시간대가 아니라 한국 시간이다 — 백엔드 판정(seoulClock)과 같은 기준(TIMEZONE.md).
describe('createRecruitmentSchema — 오늘은 한국 시간 날짜', () => {
  // 이 패키지는 Node 타입이 없어 process 대신 vi.stubEnv 로 기기 시간대를 바꾸고 되돌린다.
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('뉴욕 기기(아직 10/31)에서 한국 11/01 00:10 이면 종료일 10/31 은 지난 날, 11/01 은 오늘', () => {
    vi.stubEnv('TZ', 'America/New_York');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:10:00+09:00'));

    expect(createRecruitmentSchema.safeParse(createPayload({ startDate: '2026-10-25', endDate: '2026-10-31' })).success).toBe(false);
    expect(createRecruitmentSchema.safeParse(createPayload({ startDate: '2026-10-25', endDate: '2026-11-01' })).success).toBe(true);
  });
});
