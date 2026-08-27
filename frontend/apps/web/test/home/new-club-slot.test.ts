import { describe, expect, it } from 'vitest';
import type { ClubSummary, RecruitmentDisplayStatus } from '@duing/types';

import { applyNewClubSlot } from '@/app/_lib/home-data';

const TODAY = new Date('2026-08-28T09:00:00+09:00');

function club(
  id: number,
  recruitmentStartDate: string | null,
  displayStatus: RecruitmentDisplayStatus = 'OPEN',
): ClubSummary {
  return {
    id,
    name: `동아리${id}`,
    category: 'ACADEMIC',
    division: null,
    college: null,
    department: null,
    logoUrl: null,
    status: 'ACTIVE',
    tags: [],
    tagline: null,
    centralClub: false,
    weeklyInterestCount: 0,
    activeRecruitment:
      recruitmentStartDate === null
        ? null
        : {
            recruitmentId: id * 10,
            displayStatus,
            startDate: recruitmentStartDate,
            endDate: null,
          },
  };
}

const LONG_AGO = '2026-01-01';
const RECENT = '2026-08-20';

describe('applyNewClubSlot — 신규 동아리 슬롯', () => {
  it('상위 목록에 최근 모집을 시작한 동아리가 이미 있으면 관심도 순서를 그대로 둔다', () => {
    const candidates = [club(1, LONG_AGO), club(2, RECENT), club(3, LONG_AGO), club(4, LONG_AGO), club(5, RECENT)];

    const result = applyNewClubSlot(candidates, 4, TODAY);

    expect(result.map((each) => each.id)).toEqual([1, 2, 3, 4]);
  });

  it('상위에 신규가 하나도 없으면 마지막 칸만 후보 중 신규 동아리로 바꾼다', () => {
    const candidates = [club(1, LONG_AGO), club(2, LONG_AGO), club(3, LONG_AGO), club(4, LONG_AGO), club(5, RECENT)];

    const result = applyNewClubSlot(candidates, 4, TODAY);

    // 상위 3칸은 관심도 순서 그대로 — 슬롯 규칙이 순위를 흔들지 않는다.
    expect(result.map((each) => each.id)).toEqual([1, 2, 3, 5]);
  });

  it('후보 전체에 신규가 없으면 아무것도 바꾸지 않는다', () => {
    const candidates = [club(1, LONG_AGO), club(2, LONG_AGO), club(3, LONG_AGO), club(4, LONG_AGO), club(5, null)];

    const result = applyNewClubSlot(candidates, 4, TODAY);

    expect(result.map((each) => each.id)).toEqual([1, 2, 3, 4]);
  });

  it('후보가 칸 수보다 적으면 자리를 비우거나 바꾸지 않는다', () => {
    const candidates = [club(1, LONG_AGO), club(2, LONG_AGO)];

    const result = applyNewClubSlot(candidates, 4, TODAY);

    expect(result.map((each) => each.id)).toEqual([1, 2]);
  });

  it('모집 시작일이 판정 창을 막 벗어나면 신규로 보지 않는다', () => {
    // 창은 30일 — 31일 전 시작은 더 이상 "최근 모집 시작" 이 아니다.
    const justOutside = '2026-07-28';
    const candidates = [club(1, LONG_AGO), club(2, LONG_AGO), club(3, LONG_AGO), club(4, LONG_AGO), club(5, justOutside)];

    const result = applyNewClubSlot(candidates, 4, TODAY);

    expect(result.map((each) => each.id)).toEqual([1, 2, 3, 4]);
  });

  it('최근에 시작했더라도 이미 마감된 모집은 신규로 보지 않는다', () => {
    // 시작일만 보면 8월 초에 끝난 단기 모집이 30일간 "신규" 로 잡혀,
    // 모집마감 배지를 단 카드가 슬롯을 차지한다. 이 슬롯은 지금 지원할 수 있는 곳을 위한 자리다.
    const candidates = [
      club(1, LONG_AGO),
      club(2, LONG_AGO),
      club(3, LONG_AGO),
      club(4, LONG_AGO),
      club(5, RECENT, 'CLOSED'),
    ];

    expect(applyNewClubSlot(candidates, 4, TODAY).map((each) => each.id)).toEqual([1, 2, 3, 4]);
  });

  it('상위에 마감된 최근 모집이 있어도, 아래의 열린 신규에게 슬롯을 내준다', () => {
    // 반대 방향 구멍 — 상위 판정에 마감 건이 섞이면 양보 자체가 일어나지 않는다.
    const candidates = [
      club(1, RECENT, 'CLOSED'),
      club(2, LONG_AGO),
      club(3, LONG_AGO),
      club(4, LONG_AGO),
      club(5, RECENT),
    ];

    expect(applyNewClubSlot(candidates, 4, TODAY).map((each) => each.id)).toEqual([1, 2, 3, 5]);
  });

  it('상시모집도 열린 모집이라 신규 슬롯 대상이다', () => {
    const candidates = [
      club(1, LONG_AGO),
      club(2, LONG_AGO),
      club(3, LONG_AGO),
      club(4, LONG_AGO),
      club(5, RECENT, 'ALWAYS_OPEN'),
    ];

    expect(applyNewClubSlot(candidates, 4, TODAY).map((each) => each.id)).toEqual([1, 2, 3, 5]);
  });

  it('아직 시작하지 않은(미래 시작일) 모집은 신규 슬롯 대상이 아니다', () => {
    const future = '2026-09-10';
    const candidates = [club(1, LONG_AGO), club(2, LONG_AGO), club(3, LONG_AGO), club(4, LONG_AGO), club(5, future)];

    const result = applyNewClubSlot(candidates, 4, TODAY);

    expect(result.map((each) => each.id)).toEqual([1, 2, 3, 4]);
  });
});
