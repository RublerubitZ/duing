import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPLORE_PARAMS,
  parseExploreParams,
  serializeExploreParams,
  toApiParams,
} from '../../app/clubs/_lib/exploreParams';

describe('exploreParams — RecruitmentFilter 라운드 트립', () => {
  it("recruitment='available' 은 URL 직렬화 후 다시 같은 값으로 파싱된다", () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'available' });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.recruitment).toBe('available');
  });

  it("이전 URL 의 recruitment='open' 은 'available' 로 마이그레이션된다", () => {
    const parsed = parseExploreParams(new URLSearchParams('recruitment=open'));
    expect(parsed.recruitment).toBe('available');
  });

  it("recruitment='available' → API recruitmentStatus=AVAILABLE", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'available' }, 20);
    expect(api.recruitmentStatus).toBe('AVAILABLE');
    expect(api.recruiting).toBeUndefined();
  });

  it("recruitment='upcoming' → API recruitmentStatus=UPCOMING", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'upcoming' }, 20);
    expect(api.recruitmentStatus).toBe('UPCOMING');
  });

  it("recruitment='closed' → API recruitmentStatus=CLOSED", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'closed' }, 20);
    expect(api.recruitmentStatus).toBe('CLOSED');
  });

  it("recruitment='all' → API recruitmentStatus 미전송", () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, recruitment: 'all' }, 20);
    expect(api.recruitmentStatus).toBeUndefined();
  });
});

describe('exploreParams — category 라운드 트립', () => {
  it("category='CREATION' 은 URL 직렬화 후 다시 같은 값으로 파싱된다", () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS, category: 'CREATION' });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.category).toBe('CREATION');
  });

  it("이전 URL 의 category='CULTURE'(문화) 는 'CREATION'(창작) 으로 마이그레이션된다", () => {
    const parsed = parseExploreParams(new URLSearchParams('category=CULTURE'));
    expect(parsed.category).toBe('CREATION');
  });

  it('알 수 없는 category 값은 무시되어 null 로 파싱된다', () => {
    const parsed = parseExploreParams(new URLSearchParams('category=BANANA'));
    expect(parsed.category).toBeNull();
  });
});

describe('exploreParams — activeDays 라운드 트립 및 정규화', () => {
  it('activeDays 값들이 URL 직렬화 후 같은 값으로 파싱된다', () => {
    const query = serializeExploreParams({
      ...DEFAULT_EXPLORE_PARAMS,
      activeDays: ['MONDAY', 'WEDNESDAY'],
    });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.activeDays).toEqual(['MONDAY', 'WEDNESDAY']);
  });

  it('URL 의 잘못된 활동요일 값은 화이트리스트 필터링되어 무시된다', () => {
    const parsed = parseExploreParams(
      new URLSearchParams('activeDays=MONDAY&activeDays=BANANA'),
    );
    expect(parsed.activeDays).toEqual(['MONDAY']);
  });

  it('URL 에 activeDays 가 없으면 빈 배열로 파싱된다', () => {
    const parsed = parseExploreParams(new URLSearchParams(''));
    expect(parsed.activeDays).toEqual([]);
  });

  it('activeDays 빈 배열이면 toApiParams 에서 undefined', () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, activeDays: [] }, 20);
    expect(api.activeDays).toBeUndefined();
  });

  it('activeDays 7개 전체이면 toApiParams 에서 undefined (정규화)', () => {
    const api = toApiParams(
      {
        ...DEFAULT_EXPLORE_PARAMS,
        activeDays: [
          'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
          'FRIDAY', 'SATURDAY', 'SUNDAY',
        ],
      },
      20,
    );
    expect(api.activeDays).toBeUndefined();
  });

  it('activeDays 부분 선택은 toApiParams 에 그대로 전달된다', () => {
    const api = toApiParams(
      { ...DEFAULT_EXPLORE_PARAMS, activeDays: ['MONDAY', 'WEDNESDAY'] },
      20,
    );
    expect(api.activeDays).toEqual(['MONDAY', 'WEDNESDAY']);
  });
});