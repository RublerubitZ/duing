import { describe, expect, it } from 'vitest';

import { isRecruitmentExpiredOpen, recruitmentStatusChip } from '@/app/_lib/recruitmentDisplay';
import { STATUS_ACTIONS } from '@/app/admin/clubs/_lib/clubStatus';

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

describe('동아리 운영 중단 안내', () => {
  it('진행 중인 모집이 마감된다는 사실과 되돌릴 수 없음을 함께 알린다', () => {
    // 실제로는 운영 중단이 OPEN 모집을 일괄 마감하는데, 안내가 "그대로 유지된다"고만 말하고 있었다.
    const deactivate = STATUS_ACTIONS.ACTIVE.find((action) => action.nextStatus === 'INACTIVE');

    expect(deactivate?.description).toContain('마감');
    expect(deactivate?.description).toContain('되돌릴 수 없');
  });

  it('재활성 안내는 마감된 모집이 되살아나는 것처럼 말하지 않는다', () => {
    const reactivate = STATUS_ACTIONS.INACTIVE.find((action) => action.nextStatus === 'ACTIVE');

    expect(reactivate?.description).toContain('복구되지 않');
  });
});
