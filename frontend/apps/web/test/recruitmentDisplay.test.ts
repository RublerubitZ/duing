import { describe, expect, it } from 'vitest';
import type { RecruitmentSummary } from '@duing/types';
import {
  RECRUITMENT_DISPLAY_STATUS_LABEL,
  displayStatusLabel,
  recruitmentPeriodLabel,
  recruitmentDaysLeft,
  recruitmentExpiredOpenNotice,
  recruitmentStatusChip,
} from '../app/_lib/recruitmentDisplay';

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
