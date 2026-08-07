import { describe, expect, it } from 'vitest';

import { STATUS_ACTIONS } from '@/app/admin/clubs/_lib/clubStatus';
import {
  needsOperatorAttention,
  recruitmentConsoleChip,
} from '@/app/admin/recruitments/_lib/recruitmentLabels';

describe('총동연 모집 상태 칩', () => {
  it('기간이 끝났는데 아직 열려 있으면 모집중이 아니라 기간 종료로 읽는다', () => {
    expect(recruitmentConsoleChip({ status: 'OPEN', displayStatus: 'CLOSED' }).label).toBe(
      '기간 종료',
    );
    expect(needsOperatorAttention({ status: 'OPEN', displayStatus: 'CLOSED' })).toBe(true);
  });

  it('마감된 모집은 운영 개입 대상이 아니다', () => {
    expect(recruitmentConsoleChip({ status: 'CLOSED', displayStatus: 'CLOSED' }).label).toBe('마감');
    expect(needsOperatorAttention({ status: 'CLOSED', displayStatus: 'CLOSED' })).toBe(false);
  });

  it('진행 중·상시 모집은 표시 상태 그대로 읽는다', () => {
    expect(recruitmentConsoleChip({ status: 'OPEN', displayStatus: 'OPEN' }).label).toBe('모집중');
    expect(recruitmentConsoleChip({ status: 'OPEN', displayStatus: 'ALWAYS_OPEN' }).label).toBe(
      '상시모집',
    );
    expect(needsOperatorAttention({ status: 'OPEN', displayStatus: 'ALWAYS_OPEN' })).toBe(false);
  });

  it('표시 상태가 없는 구 응답에서도 칩이 비지 않고 판정은 보류한다', () => {
    // 프론트와 서버는 따로 배포된다 — 전환기에 새 필드가 없는 응답이 와도 화면이 깨지면 안 되고,
    // 근거 없이 "운영 개입 필요"를 띄워서도 안 된다.
    expect(recruitmentConsoleChip({ status: 'OPEN' }).label).toBe('모집중');
    expect(recruitmentConsoleChip({ status: 'CLOSED' }).label).toBe('마감');
    expect(needsOperatorAttention({ status: 'OPEN' })).toBe(false);
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
