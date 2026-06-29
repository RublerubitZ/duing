import { describe, it, expect, vi, beforeEach } from 'vitest';
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

beforeEach(() => {
  createApiClientMock.mockReset();
  listMock.mockReset();
  createApiClientMock.mockReturnValue({ publicActivities: { list: listMock } });
});

describe('fetchPublicActivities', () => {
  it('list 가 throw 하면 빈 배열을 반환한다(폴백 토스트로 대체)', async () => {
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

  it('상위 2건만 요청한다(limit=2)', async () => {
    listMock.mockResolvedValue({ items: [] });

    await fetchPublicActivities();

    expect(listMock).toHaveBeenCalledWith({ limit: 2 });
  });
});
