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