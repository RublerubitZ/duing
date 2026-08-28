import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PublicActivityFeed } from '@duing/types';

// createApiClient 를 모킹해, 백엔드 호출 없이 fetchPublicActivities 의 매핑·폴백·파라미터를 검증한다.
const { createApiClientMock, listMock } = vi.hoisted(() => ({
  createApiClientMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock('@duing/api', () => ({
  createApiClient: createApiClientMock,
}));

import { fetchPublicActivities } from '@/app/_lib/public-activities';

/** 실패 정책 분기의 입력인 두 환경변수만 명시적으로 고정한다(런타임 = 빌드 국면 아님). */
function stubPhase(nodeEnv: string, nextPhase?: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PHASE', nextPhase);
}

beforeEach(() => {
  createApiClientMock.mockReset();
  listMock.mockReset();
  createApiClientMock.mockReturnValue({ publicActivities: { list: listMock } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchPublicActivities', () => {
  it('production 런타임(ISR 재생성)에서 list 가 throw 하면 그대로 throw 한다(직전 캐시본 유지)', async () => {
    stubPhase('production');
    listMock.mockRejectedValue(new Error('backend unavailable'));

    await expect(fetchPublicActivities()).rejects.toThrow('backend unavailable');
  });

  it('빌드 국면에서는 list 가 throw 해도 빈 배열을 반환한다(폴백 토스트로 대체)', async () => {
    stubPhase('production', 'phase-production-build');
    listMock.mockRejectedValue(new Error('backend unavailable'));

    await expect(fetchPublicActivities()).resolves.toEqual([]);
  });

  it('development 에서 list 가 throw 하면 빈 배열을 반환한다(폴백 토스트로 대체)', async () => {
    stubPhase('development');
    listMock.mockRejectedValue(new Error('backend unavailable'));

    const activities = await fetchPublicActivities();

    expect(activities).toEqual([]);
  });

  it('items 를 HeroActivity(type·clubName·occurredAt)로 매핑한다(clubId 제외)', async () => {
    const feed: PublicActivityFeed = {
      items: [
        { type: 'NOTICE_CREATED', clubId: 7, clubName: '두잉코딩', occurredAt: '2026-06-28T11:30:00Z' },
        { type: 'INTERVIEW_RESULT', clubId: 3, clubName: '캠퍼스밴드', occurredAt: '2026-06-28T09:00:00Z' },
      ],
    };
    listMock.mockResolvedValue(feed);

    const activities = await fetchPublicActivities();

    expect(activities).toEqual([
      { type: 'NOTICE_CREATED', clubName: '두잉코딩', occurredAt: '2026-06-28T11:30:00Z' },
      { type: 'INTERVIEW_RESULT', clubName: '캠퍼스밴드', occurredAt: '2026-06-28T09:00:00Z' },
    ]);
  });

  it('토스트 슬라이드 상한과 같은 5건을 요청한다(limit=5)', async () => {
    listMock.mockResolvedValue({ items: [] });

    await fetchPublicActivities();

    expect(listMock).toHaveBeenCalledWith({ limit: 5 });
  });
});
