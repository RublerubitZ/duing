import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPLORE_PARAMS,
  hasNonFavoriteFilters,
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

describe('exploreParams — sort(추천순) 라운드 트립', () => {
  it("sort 미지정이면 기본값 'RECOMMENDED'(추천순) 로 파싱된다", () => {
    const parsed = parseExploreParams(new URLSearchParams(''));
    expect(parsed.sort).toBe('RECOMMENDED');
  });

  it("이전 URL 의 sort='RECENT'(최근 등록순) 는 'RECOMMENDED' 로 마이그레이션된다", () => {
    const parsed = parseExploreParams(new URLSearchParams('sort=RECENT'));
    expect(parsed.sort).toBe('RECOMMENDED');
  });

  it("기본값 'RECOMMENDED' 는 URL 에 직렬화되지 않는다", () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS, sort: 'RECOMMENDED' });
    expect(new URLSearchParams(query).get('sort')).toBeNull();
  });

  it("sort='DEADLINE_SOON' 은 URL 직렬화 후 같은 값으로 파싱된다", () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS, sort: 'DEADLINE_SOON' });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.sort).toBe('DEADLINE_SOON');
  });

  it("API 파라미터에는 기본 정렬도 'RECOMMENDED' 로 명시 전송된다", () => {
    const api = toApiParams(DEFAULT_EXPLORE_PARAMS, 20);
    expect(api.sort).toBe('RECOMMENDED');
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

describe('exploreParams — favorite 필터', () => {
  it('favorite=true 는 URL 직렬화 후 다시 true 로 파싱된다', () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS, favorite: true });
    const parsed = parseExploreParams(new URLSearchParams(query));
    expect(parsed.favorite).toBe(true);
  });

  it('기본값(false)은 URL 에서 생략된다', () => {
    const query = serializeExploreParams({ ...DEFAULT_EXPLORE_PARAMS });
    expect(query).not.toContain('favorite');
  });

  it("URL 의 favorite=1 같은 비정규 값은 false 로 파싱된다", () => {
    const parsed = parseExploreParams(new URLSearchParams('favorite=1'));
    expect(parsed.favorite).toBe(false);
  });

  it('favorite=true → API favorite=true 전송', () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS, favorite: true }, 20);
    expect(api.favorite).toBe(true);
  });

  it('favorite=false → API favorite 미전송', () => {
    const api = toApiParams({ ...DEFAULT_EXPLORE_PARAMS }, 20);
    expect(api.favorite).toBeUndefined();
  });
});

describe('exploreParams — hasNonFavoriteFilters', () => {
  it('모든 필터가 기본값이면 false — favorite·page·sort 는 세지 않는다', () => {
    expect(
      hasNonFavoriteFilters({ ...DEFAULT_EXPLORE_PARAMS, favorite: true, page: 3, sort: 'ALPHABETICAL' }),
    ).toBe(false);
  });

  it('카테고리가 걸려 있으면 true', () => {
    expect(hasNonFavoriteFilters({ ...DEFAULT_EXPLORE_PARAMS, category: 'SPORTS' })).toBe(true);
  });

  it('요일 7개 전체 선택은 필터 미적용으로 본다', () => {
    expect(
      hasNonFavoriteFilters({
        ...DEFAULT_EXPLORE_PARAMS,
        activeDays: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      }),
    ).toBe(false);
  });

  it('요일이 일부만 선택되면 true', () => {
    expect(hasNonFavoriteFilters({ ...DEFAULT_EXPLORE_PARAMS, activeDays: ['MONDAY'] })).toBe(true);
  });
});
