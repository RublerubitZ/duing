import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClubSummary, PageResponse, PromotionCard } from '@duing/types';

// createApiClient 를 모킹해, 백엔드 호출 없이 home-data 로더들의 실패 정책(fail-soft ↔ throw)을 검증한다.
// 홈(/)은 ISR(revalidate 600s) 이라 재생성 중 백엔드 순단을 swallow 하면 빈 홈이 600초 전역 캐시된다.
const { createApiClientMock, clubsListMock, promotionsListMock } = vi.hoisted(() => ({
  createApiClientMock: vi.fn(),
  clubsListMock: vi.fn(),
  promotionsListMock: vi.fn(),
}));

vi.mock('@duing/api', () => ({
  createApiClient: createApiClientMock,
}));

import {
  fetchInterestingClubs,
  fetchPublicPromotionSlides,
  fetchUpcomingDeadlineClubs,
} from '@/app/_lib/home-data';

function emptyPage<T>(): PageResponse<T> {
  return { content: [], page: 0, size: 10, totalElements: 0, totalPages: 0, hasNext: false };
}

/** 실패 정책 분기의 입력인 두 환경변수만 명시적으로 고정한다(런타임 = 빌드 국면 아님). */
function stubPhase(nodeEnv: string, nextPhase?: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PHASE', nextPhase);
}

beforeEach(() => {
  createApiClientMock.mockReset();
  clubsListMock.mockReset();
  promotionsListMock.mockReset();
  createApiClientMock.mockReturnValue({
    clubs: { list: clubsListMock },
    promotions: { list: promotionsListMock },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function rejectAll() {
  const backendDown = new Error('backend unavailable');
  clubsListMock.mockRejectedValue(backendDown);
  promotionsListMock.mockRejectedValue(backendDown);
}

describe('home-data 로더 — production 런타임(ISR 재생성)에서 백엔드 실패', () => {
  beforeEach(() => {
    stubPhase('production');
    rejectAll();
  });

  it('fetchInterestingClubs 가 throw 한다(직전 캐시본 유지에 위임)', async () => {
    await expect(fetchInterestingClubs(4)).rejects.toThrow('backend unavailable');
  });

  it('fetchUpcomingDeadlineClubs 가 throw 한다', async () => {
    await expect(fetchUpcomingDeadlineClubs(40)).rejects.toThrow('backend unavailable');
  });

  it('fetchPublicPromotionSlides 가 throw 한다(정적 폴백 배너로 덮지 않는다)', async () => {
    await expect(fetchPublicPromotionSlides()).rejects.toThrow('backend unavailable');
  });
});

describe('home-data 로더 — 빌드 국면(NEXT_PHASE=phase-production-build)에서 백엔드 실패', () => {
  beforeEach(() => {
    stubPhase('production', 'phase-production-build');
    rejectAll();
  });

  it('fetchInterestingClubs 는 빈 배열로 폴백한다(BE 순단이 배포를 깨지 않도록)', async () => {
    await expect(fetchInterestingClubs(4)).resolves.toEqual([]);
  });

  it('fetchUpcomingDeadlineClubs 는 빈 배열로 폴백한다', async () => {
    await expect(fetchUpcomingDeadlineClubs(40)).resolves.toEqual([]);
  });

  it('fetchPublicPromotionSlides 는 정적 폴백 배너를 반환한다', async () => {
    const slides = await fetchPublicPromotionSlides();

    expect(slides.length).toBeGreaterThan(0);
  });
});

describe('home-data 로더 — development 에서 백엔드 실패', () => {
  beforeEach(() => {
    stubPhase('development');
    rejectAll();
  });

  it('백엔드 없이 프론트만 띄우는 DX 를 위해 fail-soft 를 유지한다', async () => {
    await expect(fetchInterestingClubs(4)).resolves.toEqual([]);
    await expect(fetchUpcomingDeadlineClubs(40)).resolves.toEqual([]);
    await expect(fetchPublicPromotionSlides()).resolves.not.toHaveLength(0);
  });
});

describe('home-data 로더 — 정상 응답', () => {
  it('production 런타임에서도 빈 DB(프로모션 0건)면 정적 폴백 배너를 반환한다', async () => {
    stubPhase('production');
    promotionsListMock.mockResolvedValue(emptyPage<PromotionCard>());

    const slides = await fetchPublicPromotionSlides();

    expect(slides.length).toBeGreaterThan(0);
  });

  it('production 런타임에서 목록이 비어도(장애 아님) 빈 배열을 그대로 반환한다', async () => {
    stubPhase('production');
    clubsListMock.mockResolvedValue(emptyPage<ClubSummary>());

    await expect(fetchInterestingClubs(4)).resolves.toEqual([]);
  });
});
