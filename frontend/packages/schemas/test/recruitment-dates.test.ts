import { describe, it, expect } from 'vitest';
import { createRecruitmentSchema, updateRecruitmentSchema } from '../src/index';

// BE GeneralRecruitmentService 와 같은 규칙: 생성은 과거 종료일 차단, 수정은 기존 과거
// 종료일 재전송(만료-OPEN 편집)이 정당해 스키마 차원에서 막지 않는다(변경 여부는 BE 판정).
// 날짜는 로컬 타임존 기준 — 스키마의 오늘 계산과 같은 방식으로 만들어 자정 경계 플레이크를 피한다.
function localIsoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function createPayload(overrides: Record<string, unknown>) {
  return {
    title: '2026 신입 모집',
    startDate: localIsoDate(0),
    endDate: localIsoDate(7),
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
      createPayload({ startDate: localIsoDate(-3), endDate: localIsoDate(-1) }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.message === '모집 종료일은 오늘 이후여야 합니다.')).toBe(true);
    }
  });

  it('종료일이 오늘인 모집은 오늘 하루 지원을 받으므로 허용된다', () => {
    const result = createRecruitmentSchema.safeParse(
      createPayload({ startDate: localIsoDate(-3), endDate: localIsoDate(0) }),
    );

    expect(result.success).toBe(true);
  });

  it('시작일이 과거여도 종료일이 미래면 허용된다 — 이미 진행 중인 모집의 뒤늦은 등록 경로', () => {
    const result = createRecruitmentSchema.safeParse(
      createPayload({ startDate: localIsoDate(-5), endDate: localIsoDate(7) }),
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
      startDate: localIsoDate(-10),
      endDate: localIsoDate(-3),
      capacity: 10,
      useInterview: false,
    });

    expect(result.success).toBe(true);
  });
});
