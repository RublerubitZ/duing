import { describe, expect, it } from 'vitest';
import type { RecruitmentAutoCloseOutlook, RecruitmentDisplayStatus, RecruitmentSummary } from '@duing/types';
import {
  RECRUITMENT_DISPLAY_STATUS_LABEL,
  adminAutoCloseBadge,
  displayStatusLabel,
  formatAutoCloseDate,
  isRecruitmentExpiredOpen,
  recruitmentPeriodLabel,
  recruitmentDaysLeft,
  recruitmentExpiredOpenNotice,
  recruitmentStatusChip,
} from '../app/_lib/recruitmentDisplay';

function outlook(overrides: Partial<RecruitmentAutoCloseOutlook> = {}): RecruitmentAutoCloseOutlook {
  return {
    closesOn: '2026-12-08',
    gracePeriodOver: false,
    undecidedApplicationCount: 0,
    inProgressRoundCount: 0,
    ...overrides,
  };
}

const EXPIRED_OPEN_LEAD = '모집 기간이 끝났지만 아직 마감 전이에요.';

describe('recruitmentExpiredOpenNotice — 서버 자동 마감 전망(#1572)', () => {
  it('전망이 없으면(옛 서버·조회 실패·자동 마감 꺼짐) 지금 문장 그대로다', () => {
    expect(recruitmentExpiredOpenNotice('SELF', undefined)).toBe(recruitmentExpiredOpenNotice('SELF'));
    expect(recruitmentExpiredOpenNotice('SELF', null)).toBe(recruitmentExpiredOpenNotice('SELF'));
    expect(recruitmentExpiredOpenNotice('EXTERNAL', null)).toBe(recruitmentExpiredOpenNotice('EXTERNAL'));
  });

  it('결과 없는 지원과 끝나지 않은 면접 라운드가 함께 막으면 두 수를 함께 알린다', () => {
    expect(
      recruitmentExpiredOpenNotice(
        'SELF',
        outlook({ gracePeriodOver: true, undecidedApplicationCount: 2, inProgressRoundCount: 1 }),
      ),
    ).toBe(
      `${EXPIRED_OPEN_LEAD} 결과를 정하지 않은 지원 2건과 끝나지 않은 면접 라운드 1개가 남아 있어 자동으로 마감되지 않아요. 남은 심사와 면접을 마치거나 직접 '모집 마감'을 눌러 주세요.`,
    );
  });

  it('결과 없는 지원만 막으면 그 수와 심사를 마치라는 안내를 쓴다', () => {
    expect(recruitmentExpiredOpenNotice('SELF', outlook({ undecidedApplicationCount: 3 }))).toBe(
      `${EXPIRED_OPEN_LEAD} 결과를 정하지 않은 지원 3건이 남아 있어 자동으로 마감되지 않아요. 남은 지원자 심사를 마치거나 직접 '모집 마감'을 눌러 주세요.`,
    );
  });

  it('결과를 다 정했는데 끝나지 않은 면접 라운드만 막으면 라운드를 정리하라고 알린다(운영 모집 80 모양)', () => {
    expect(
      recruitmentExpiredOpenNotice('SELF', outlook({ gracePeriodOver: true, inProgressRoundCount: 1 })),
    ).toBe(
      `${EXPIRED_OPEN_LEAD} 끝나지 않은 면접 라운드 1개가 남아 있어 자동으로 마감되지 않아요. 면접 라운드를 확정하거나 취소하고, 아니면 직접 '모집 마감'을 눌러 주세요.`,
    );
  });

  it('막는 것이 없고 유예 중이면 자동 마감 날짜를 알린다', () => {
    expect(recruitmentExpiredOpenNotice('SELF', outlook())).toBe(
      `${EXPIRED_OPEN_LEAD} 남은 심사·면접이 없어 12월 8일 새벽에 자동으로 마감돼요.`,
    );
  });

  it('막는 것이 없고 유예가 끝났으면 곧 마감된다고 알린다', () => {
    expect(recruitmentExpiredOpenNotice('SELF', outlook({ gracePeriodOver: true }))).toBe(
      `${EXPIRED_OPEN_LEAD} 남은 심사·면접이 없어 곧 자동으로 마감돼요. 매일 새벽 0시 40분에 확인해요.`,
    );
  });

  it('외부 폼인데 막는 수가 오면(있을 수 없는 값) 자체 폼과 같은 막힘 문장을 쓴다', () => {
    expect(recruitmentExpiredOpenNotice('EXTERNAL', outlook({ undecidedApplicationCount: 1 }))).toBe(
      `${EXPIRED_OPEN_LEAD} 결과를 정하지 않은 지원 1건이 남아 있어 자동으로 마감되지 않아요. 남은 지원자 심사를 마치거나 직접 '모집 마감'을 눌러 주세요.`,
    );
  });

  it('외부 폼은 가입 처리 안내와 함께 자동 마감 날짜를 알린다', () => {
    expect(recruitmentExpiredOpenNotice('EXTERNAL', outlook())).toBe(
      `${EXPIRED_OPEN_LEAD} 가입 처리를 마치면 모집을 마감해 주세요. 그대로 두면 12월 8일 새벽에 자동으로 마감돼요.`,
    );
    expect(recruitmentExpiredOpenNotice('EXTERNAL', outlook({ gracePeriodOver: true }))).toBe(
      `${EXPIRED_OPEN_LEAD} 가입 처리를 마치면 모집을 마감해 주세요. 그대로 두면 곧 자동으로 마감돼요. 매일 새벽 0시 40분에 확인해요.`,
    );
  });
});

describe('formatAutoCloseDate', () => {
  it('KST 날짜를 앞자리 0 없이 "M월 D일"로 쓴다', () => {
    expect(formatAutoCloseDate('2026-12-08')).toBe('12월 8일');
    expect(formatAutoCloseDate('2027-01-01')).toBe('1월 1일');
  });

  it('형식이 어긋난 값이면 화면을 깨뜨리지 않고 받은 문자열을 그대로 쓴다', () => {
    expect(formatAutoCloseDate('not-a-date')).toBe('not-a-date');
  });
});

describe('adminAutoCloseBadge — 총동연 모집 목록 배지(#1583)', () => {
  const expiredOpen = { status: 'OPEN', displayStatus: 'CLOSED' } as const;

  it('기간이 끝난 OPEN 모집이 아니면 배지가 없다', () => {
    expect(adminAutoCloseBadge({ status: 'OPEN', displayStatus: 'OPEN', autoClose: null })).toBeNull();
    expect(adminAutoCloseBadge({ status: 'CLOSED', displayStatus: 'CLOSED', autoClose: undefined })).toBeNull();
  });

  it('전망이 없으면(옛 서버·자동 마감 꺼짐) 지금처럼 운영 개입 필요를 붙인다', () => {
    const conservative = { label: '운영 개입 필요', tone: 'warm', detail: null };
    expect(adminAutoCloseBadge({ ...expiredOpen, autoClose: undefined })).toEqual(conservative);
    expect(adminAutoCloseBadge({ ...expiredOpen, autoClose: null })).toEqual(conservative);
  });

  it('막는 것이 없으면 자동 마감 예정 — 유예 중이면 날짜, 유예가 끝났으면 다음 새벽', () => {
    expect(adminAutoCloseBadge({ ...expiredOpen, autoClose: outlook() })).toEqual({
      label: '자동 마감 예정',
      tone: 'neutral',
      detail: '12월 8일 새벽',
    });
    expect(adminAutoCloseBadge({ ...expiredOpen, autoClose: outlook({ gracePeriodOver: true }) })).toEqual({
      label: '자동 마감 예정',
      tone: 'neutral',
      detail: '다음 새벽',
    });
  });

  it('유예가 끝났는데 막혀 있으면 운영 개입 필요와 막는 이유를 함께 보인다', () => {
    expect(
      adminAutoCloseBadge({
        ...expiredOpen,
        autoClose: outlook({ gracePeriodOver: true, undecidedApplicationCount: 2, inProgressRoundCount: 1 }),
      }),
    ).toEqual({ label: '운영 개입 필요', tone: 'warm', detail: '결과 없는 지원 2건·진행 중 면접 라운드 1개' });
    expect(
      adminAutoCloseBadge({ ...expiredOpen, autoClose: outlook({ gracePeriodOver: true, inProgressRoundCount: 1 }) }),
    ).toEqual({ label: '운영 개입 필요', tone: 'warm', detail: '진행 중 면접 라운드 1개' });
  });

  it('막혀 있어도 유예 중이면 배지가 없다 — 아직 운영진의 유예 기간이다', () => {
    expect(adminAutoCloseBadge({ ...expiredOpen, autoClose: outlook({ undecidedApplicationCount: 1 }) })).toBeNull();
  });
});

describe('displayStatusLabel', () => {
  it.each([
    ['UPCOMING', '모집예정'],
    ['OPEN', '모집중'],
    ['ALWAYS_OPEN', '상시모집'],
    ['CLOSED', '모집마감'],
  ] as const)('%s → %s', (status, expected) => {
    expect(displayStatusLabel(status)).toBe(expected);
  });
});

describe('recruitmentPeriodLabel', () => {
  it('endDate 가 null 이면 "상시모집"을 반환한다', () => {
    expect(recruitmentPeriodLabel('2026-05-01', null)).toBe('상시모집');
  });
  it('endDate 가 있으면 "YYYY-MM-DD ~ YYYY-MM-DD" 형식', () => {
    expect(recruitmentPeriodLabel('2026-05-01', '2026-05-31')).toBe('2026-05-01 ~ 2026-05-31');
  });
});

describe('recruitmentDaysLeft', () => {
  const today = new Date('2026-05-18');
  it('endDate 가 null 이면 null 을 반환한다', () => {
    expect(recruitmentDaysLeft(null, today)).toBeNull();
  });
  it('endDate 가 미래면 양수', () => {
    expect(recruitmentDaysLeft('2026-05-27', today)).toBe(9);
  });
  it('endDate 가 오늘이면 0', () => {
    expect(recruitmentDaysLeft('2026-05-18', today)).toBe(0);
  });
  it('endDate 가 과거면 음수', () => {
    expect(recruitmentDaysLeft('2026-05-10', today)).toBe(-8);
  });
});

describe('recruitmentExpiredOpenNotice — 자동 마감 안내', () => {
  it('자체 지원은 남은 심사·면접이 없을 때만 종료일로부터 7일이 지난 뒤 자동 마감된다고 알린다', () => {
    expect(recruitmentExpiredOpenNotice('SELF')).toContain(
      '심사를 마치면 모집을 마감해 주세요. 남은 심사·면접이 없으면 종료일로부터 7일이 지난 뒤 자동으로 마감돼요.',
    );
  });

  it('외부 폼은 조건 없이 종료일로부터 7일이 지나면 자동 마감된다고 알린다', () => {
    expect(recruitmentExpiredOpenNotice('EXTERNAL')).toContain(
      '가입 처리를 마치면 모집을 마감해 주세요. 종료일로부터 7일이 지나면 자동으로 마감돼요.',
    );
  });
});

describe('recruitmentStatusChip', () => {
  it('상태별 배지는 house pill 어휘를 쓴다', () => {
    const badges = {
      UPCOMING: recruitmentStatusChip({ status: 'OPEN', displayStatus: 'UPCOMING' }).badgeClass,
      OPEN: recruitmentStatusChip({ status: 'OPEN', displayStatus: 'OPEN' }).badgeClass,
      ALWAYS_OPEN: recruitmentStatusChip({ status: 'OPEN', displayStatus: 'ALWAYS_OPEN' }).badgeClass,
      CLOSED: recruitmentStatusChip({ status: 'CLOSED', displayStatus: 'CLOSED' }).badgeClass,
      EXPIRED_OPEN: recruitmentStatusChip({ status: 'OPEN', displayStatus: 'CLOSED' }).badgeClass,
    };
    expect(badges).toEqual({
      UPCOMING: 'pill pill-warm',
      OPEN: 'pill',
      ALWAYS_OPEN: 'pill pill-sky',
      CLOSED: 'pill pill-outline',
      EXPIRED_OPEN: 'pill pill-warm-outline',
    });
  });
});

describe('모집 표시 상태 라벨 — 학생·운영진·총동연이 한 테이블을 읽는다', () => {
  it('테이블 네 값', () => {
    expect(RECRUITMENT_DISPLAY_STATUS_LABEL).toEqual({
      UPCOMING: '모집예정',
      OPEN: '모집중',
      ALWAYS_OPEN: '상시모집',
      CLOSED: '모집마감',
    });
  });

  it('운영진·총동연 칩도 학생 화면과 같은 라벨을 쓴다', () => {
    expect(recruitmentStatusChip({ status: 'OPEN', displayStatus: 'UPCOMING' }).label).toBe(
      '모집예정',
    );
    expect(recruitmentStatusChip({ status: 'CLOSED', displayStatus: 'CLOSED' }).label).toBe(
      '모집마감',
    );
  });

  it('기간이 끝났지만 아직 열린 모집은 운영진 칩 "기간 종료"·학생 라벨 "모집마감"으로 갈린다', () => {
    const expiredOpen: Pick<RecruitmentSummary, 'status' | 'displayStatus'> = {
      status: 'OPEN',
      displayStatus: 'CLOSED',
    };
    expect(recruitmentStatusChip(expiredOpen).label).toBe('기간 종료');
    expect(displayStatusLabel(expiredOpen.displayStatus)).toBe('모집마감');
  });
});

describe('모르는 표시 상태 — 라벨·색만 모집마감으로 읽는다', () => {
  // 백엔드가 먼저 배포한 새 표시 상태를 흉내 낸다 — 타입에 없는 값이라 테스트에서만 단언한다.
  // toString 은 Object.prototype 에서 상속한 키라, 판정이 `in`·`??` 로 바뀌면 함수가 새어 나와 걸린다.
  const unknownStatuses = ['PAUSED', 'toString'] as unknown as RecruitmentDisplayStatus[];

  it.each(unknownStatuses)('%s — 학생 라벨은 빈칸이 아니라 모집마감이다', (unknownStatus) => {
    expect(displayStatusLabel(unknownStatus)).toBe('모집마감');
  });

  it.each(unknownStatuses)(
    '%s — 운영진·총동연 칩은 raw OPEN 이어도 기간 종료가 아니라 모집마감 라벨·색이다',
    (unknownStatus) => {
      const recruitment: Pick<RecruitmentSummary, 'status' | 'displayStatus'> = {
        status: 'OPEN',
        displayStatus: unknownStatus,
      };
      const statusChip = recruitmentStatusChip(recruitment);
      const closedChip = recruitmentStatusChip({ status: 'CLOSED', displayStatus: 'CLOSED' });

      expect(isRecruitmentExpiredOpen(recruitment)).toBe(false);
      expect(statusChip.label).toBe('모집마감');
      expect(statusChip).toEqual(closedChip);
    },
  );
});
