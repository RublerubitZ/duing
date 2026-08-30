import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClubStats } from '@duing/types';

// createApiClient 를 모킹해, 백엔드 호출 없이 fetchClubStats 의 실패 정책·매핑·왕복 수를 검증한다.
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

/** 실패 정책 분기의 입력인 두 환경변수만 명시적으로 고정한다(런타임 = 빌드 국면 아님). */
function stubPhase(nodeEnv: string, nextPhase?: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PHASE', nextPhase);
}

beforeEach(() => {
  createApiClientMock.mockReset();
  statsMock.mockReset();
  createApiClientMock.mockReturnValue({ clubs: { stats: statsMock } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchClubStats', () => {
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

  it('production 런타임(ISR 재생성)에서 실패하면 throw 한다(직전 캐시본 유지에 위임)', async () => {
    // swallow 하면 재생성이 "성공" 처리돼 통계·카테고리 개수가 빠진 홈이 600초 캐시된다.
    stubPhase('production');
    statsMock.mockRejectedValue(new Error('backend unavailable'));

    await expect(fetchClubStats()).rejects.toThrow('backend unavailable');
  });

  it('빌드 국면에서 실패하면 null 로 폴백한다(BE 순단이 배포를 깨지 않도록)', async () => {
    stubPhase('production', 'phase-production-build');
    statsMock.mockRejectedValue(new Error('backend unavailable'));

    await expect(fetchClubStats()).resolves.toBeNull();
  });

  it('development 에서 실패하면 null 로 폴백한다(BE 없이 프론트만 띄우는 DX)', async () => {
    stubPhase('development');
    statsMock.mockRejectedValue(new Error('backend unavailable'));

    await expect(fetchClubStats()).resolves.toBeNull();
  });
});
