import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ClubStats } from '@duing/types';

// createApiClient 를 모킹해, 백엔드 호출 없이 fetchClubStats 의 폴백·매핑·왕복 수를 검증한다.
const { createApiClientMock, statsMock } = vi.hoisted(() => ({
  createApiClientMock: vi.fn(),
  statsMock: vi.fn(),
}));

vi.mock('@duing/api', () => ({
  createApiClient: createApiClientMock,
}));

// React cache 는 렌더 밖에서도 호출 가능해야 하므로 통과 함수로 대체한다
// (테스트마다 다른 응답을 확인해야 해서 메모이즈가 남으면 두 번째 케이스가 첫 결과를 본다).
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T,>(fn: T) => fn };
});

import { fetchClubStats } from '@/app/_lib/club-stats';

const stats: ClubStats = {
  totalCount: 128,
  recruitingCount: 67,
  categoryCounts: { ACADEMIC: 42, SPORTS: 11 },
};

beforeEach(() => {
  createApiClientMock.mockReset();
  statsMock.mockReset();
  createApiClientMock.mockReturnValue({ clubs: { stats: statsMock } });
});

describe('fetchClubStats', () => {
  it('통계 조회가 throw 하면 null 을 반환한다(가짜 숫자 폴백 제거)', async () => {
    statsMock.mockRejectedValue(new Error('backend unavailable'));

    await expect(fetchClubStats()).resolves.toBeNull();
  });

  it('총 수·모집중 수·카테고리별 수를 응답 그대로 돌려준다', async () => {
    statsMock.mockResolvedValue(stats);

    await expect(fetchClubStats()).resolves.toEqual(stats);
  });

  it('통계 전용 엔드포인트를 한 번만 호출한다(목록 조회 두 번 왕복 회귀 방지)', async () => {
    statsMock.mockResolvedValue(stats);

    await fetchClubStats();

    expect(statsMock).toHaveBeenCalledTimes(1);
    expect(statsMock).toHaveBeenCalledWith();
  });
});
