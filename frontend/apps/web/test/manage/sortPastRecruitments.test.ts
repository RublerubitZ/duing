import { describe, it, expect } from 'vitest';
import type { RecruitmentSummary } from '@duing/types';
import {
  recruitmentClosedDateKst,
  recruitmentClosedSortKey,
  sortPastRecruitments,
} from '@/app/manage/clubs/[clubId]/_lib/sortPastRecruitments';

function recruitment(over: Partial<RecruitmentSummary> = {}): RecruitmentSummary {
  return {
    id: 1,
    clubId: 1,
    clubName: '두잉',
    title: '9기 신입 모집',
    startDate: '2026-07-01',
    endDate: '2026-07-14',
    capacity: 18,
    status: 'CLOSED',
    displayStatus: 'CLOSED',
    effectivelyOpen: false,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: true,
    targetRole: 'MEMBER',
    closedAt: null,
    ...over,
  };
}

describe('recruitmentClosedSortKey', () => {
  it('마감 스탬프가 모집 종료일보다 늦으면(lazy-close) 종료일을 종료 시점으로 본다', () => {
    const lazyClosed = recruitment({ endDate: '2026-07-14', closedAt: '2026-11-20T02:00:00Z' });
    expect(recruitmentClosedSortKey(lazyClosed)).toBe('2026-07-14');
  });

  it('종료일 전에 조기 마감하면 마감 스탬프 날짜를 종료 시점으로 본다', () => {
    const closedEarly = recruitment({ endDate: '2026-07-14', closedAt: '2026-07-08T05:30:00Z' });
    expect(recruitmentClosedSortKey(closedEarly)).toBe('2026-07-08');
  });

  it('마감 스탬프 날짜부는 KST 로 변환해 뽑는다 — UTC 문자열을 그대로 자르지 않는다', () => {
    // 2026-08-04T18:00:00Z = KST 2026-08-05 03:00 (UTC 날짜를 자르면 하루 이르다)
    const closedAfterKstMidnight = recruitment({ endDate: null, closedAt: '2026-08-04T18:00:00Z' });
    expect(recruitmentClosedSortKey(closedAfterKstMidnight)).toBe('2026-08-05');
  });

  it('KST 로는 종료일 당일 마감인 건을 조기 마감으로 오판하지 않는다', () => {
    // 2026-08-03T16:00:00Z = KST 2026-08-04 01:00 → 종료일과 같은 날이라 조기 마감이 아니다
    const closedOnEndDateKst = recruitment({ endDate: '2026-08-04', closedAt: '2026-08-03T16:00:00Z' });
    expect(recruitmentClosedSortKey(closedOnEndDateKst)).toBe('2026-08-04');
  });

  it('상시모집은 마감 스탬프의 KST 날짜가 종료 시점이다', () => {
    const alwaysOpen = recruitment({ endDate: null, closedAt: '2026-07-20T01:00:00Z' });
    expect(recruitmentClosedSortKey(alwaysOpen)).toBe('2026-07-20');
  });

  it('마감 스탬프가 없는 레거시 건은 종료일(없으면 시작일)로 폴백한다', () => {
    expect(recruitmentClosedSortKey(recruitment({ endDate: '2026-07-14', closedAt: null }))).toBe(
      '2026-07-14',
    );
    expect(
      recruitmentClosedSortKey(recruitment({ startDate: '2026-06-01', endDate: null, closedAt: null })),
    ).toBe('2026-06-01');
  });

  it('마감 스탬프가 깨진 값이면 폴백 키를 쓴다', () => {
    const brokenStamp = recruitment({ endDate: null, startDate: '2026-06-01', closedAt: 'not-a-date' });
    expect(recruitmentClosedSortKey(brokenStamp)).toBe('2026-06-01');
  });

  it('closedAt 을 아직 내려주지 않는 백엔드 응답에서도 폴백 키를 쓴다', () => {
    // 배포 전환기·구 캐시 응답은 필드 자체가 없어 undefined 로 들어온다
    const withoutClosedAt = recruitment({ endDate: null, startDate: '2026-06-01', closedAt: undefined });
    expect(recruitmentClosedSortKey(withoutClosedAt)).toBe('2026-06-01');
    expect(recruitmentClosedDateKst(undefined)).toBeNull();
  });
});

describe('sortPastRecruitments', () => {
  it('종료 시점 내림차순으로 정렬한다 — lazy-close 스탬프에 순서가 흔들리지 않는다', () => {
    const older = recruitment({ id: 1, endDate: '2026-03-10', closedAt: '2026-11-20T02:00:00Z' });
    const newer = recruitment({ id: 2, endDate: '2026-07-14', closedAt: '2026-07-14T09:00:00Z' });
    const middle = recruitment({ id: 3, endDate: null, closedAt: '2026-05-02T01:00:00Z' });

    expect(sortPastRecruitments([older, newer, middle]).map((item) => item.id)).toEqual([2, 3, 1]);
  });

  it('종료 시점이 같으면 원래 순서를 유지한다', () => {
    const first = recruitment({ id: 1, endDate: '2026-07-14' });
    const second = recruitment({ id: 2, endDate: '2026-07-14' });

    expect(sortPastRecruitments([first, second]).map((item) => item.id)).toEqual([1, 2]);
  });

  it('원본 배열을 변형하지 않는다', () => {
    const input = [
      recruitment({ id: 1, endDate: '2026-03-10' }),
      recruitment({ id: 2, endDate: '2026-07-14' }),
    ];
    sortPastRecruitments(input);
    expect(input.map((item) => item.id)).toEqual([1, 2]);
  });
});
