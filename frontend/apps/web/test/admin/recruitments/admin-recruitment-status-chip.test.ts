import { describe, expect, it } from 'vitest';

import { isRecruitmentExpiredOpen, recruitmentStatusChip } from '@/app/_lib/recruitmentDisplay';

describe('총동연 모집 상태 칩', () => {
  it('기간이 끝났는데 아직 열려 있으면 모집중이 아니라 기간 종료로 읽는다', () => {
    expect(recruitmentStatusChip({ status: 'OPEN', displayStatus: 'CLOSED' }).label).toBe(
      '기간 종료',
    );
    expect(isRecruitmentExpiredOpen({ status: 'OPEN', displayStatus: 'CLOSED' })).toBe(true);
  });

  it('마감된 모집은 운영 개입 대상이 아니다', () => {
    expect(recruitmentStatusChip({ status: 'CLOSED', displayStatus: 'CLOSED' }).label).toBe(
      '모집마감',
    );
    expect(isRecruitmentExpiredOpen({ status: 'CLOSED', displayStatus: 'CLOSED' })).toBe(false);
  });

  it('진행 중·상시 모집은 표시 상태 그대로 읽는다', () => {
    expect(recruitmentStatusChip({ status: 'OPEN', displayStatus: 'OPEN' }).label).toBe('모집중');
    expect(recruitmentStatusChip({ status: 'OPEN', displayStatus: 'ALWAYS_OPEN' }).label).toBe(
      '상시모집',
    );
    expect(isRecruitmentExpiredOpen({ status: 'OPEN', displayStatus: 'ALWAYS_OPEN' })).toBe(false);
  });
});
