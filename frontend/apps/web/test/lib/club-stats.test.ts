import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClubSummary, PageResponse } from '@duing/types';

// createApiClient 를 모킹해, 백엔드 호출 없이 fetchClubStats 의 폴백·매핑·파라미터를 검증한다.
const { createApiClientMock, listMock } = vi.hoisted(() => ({
  createApiClientMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('@duing/api', () => ({
  createApiClient: createApiClientMock,
}));

import { fetchClubStats } from '@/app/_lib/club-stats';

function makePage(totalElements: number): PageResponse<ClubSummary> {
  return {
    content: [],
    page: 0,
    size: 1,
    totalElements,
    totalPages: 1,
    hasNext: false,
  };
}

beforeEach(() => {
  createApiClientMock.mockReset();
  listMock.mockReset();
  createApiClientMock.mockReturnValue({ clubs: { list: listMock } });
});

describe('fetchClubStats', () => {
  it('clubs.list 가 throw 하면 null 을 반환한다(가짜 숫자 폴백 제거)', async () => {
    listMock.mockRejectedValue(new Error('backend unavailable'));

    const stats = await fetchClubStats();

    expect(stats).toBeNull();
  });

  it('정상 응답이면 각 totalElements 를 totalCount/recruitingCount 로 매핑한다', async () => {
    listMock
      .mockResolvedValueOnce(makePage(128))
      .mockResolvedValueOnce(makePage(67));

    const stats = await fetchClubStats();

    expect(stats).toEqual({ totalCount: 128, recruitingCount: 67 });
  });

  it('모집 카운트는 recruitmentStatus=AVAILABLE 로 조회한다(deprecated recruiting 회귀 방지)', async () => {
    listMock.mockResolvedValueOnce(makePage(128)).mockResolvedValueOnce(makePage(67));

    await fetchClubStats();

    expect(listMock).toHaveBeenNthCalledWith(1, { size: 1 });
    expect(listMock).toHaveBeenNthCalledWith(2, { recruitmentStatus: 'AVAILABLE', size: 1 });
  });
});
