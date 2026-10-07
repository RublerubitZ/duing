import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchActiveClubIdsMock, fetchPublicNoticeIdsMock } = vi.hoisted(() => ({
  fetchActiveClubIdsMock: vi.fn(),
  fetchPublicNoticeIdsMock: vi.fn(),
}));

vi.mock('@/app/_lib/public-content', () => ({
  fetchActiveClubIds: fetchActiveClubIdsMock,
  fetchPublicNoticeIds: fetchPublicNoticeIdsMock,
}));

import sitemap, { revalidate } from '@/app/sitemap';
import { SITE_URL } from '@/app/_lib/site';

const STATIC_URLS = [
  `${SITE_URL}/`,
  `${SITE_URL}/clubs`,
  `${SITE_URL}/notices`,
  `${SITE_URL}/faq`,
  `${SITE_URL}/calendar`,
  `${SITE_URL}/introduce`,
  `${SITE_URL}/terms`,
];

beforeEach(() => {
  fetchActiveClubIdsMock.mockReset();
  fetchPublicNoticeIdsMock.mockReset();
});

describe('sitemap.xml', () => {
  it('24시간마다 다시 만든다', () => {
    expect(revalidate).toBe(86400);
  });

  it('정적 경로 뒤에 공개 동아리 상세, 그 뒤에 공개 소식 상세를 붙인다', async () => {
    fetchActiveClubIdsMock.mockResolvedValue([1, 4]);
    fetchPublicNoticeIdsMock.mockResolvedValue([17, 10]);

    const entries = await sitemap();

    expect(entries.map((entry) => entry.url)).toEqual([
      ...STATIC_URLS,
      `${SITE_URL}/clubs/1`,
      `${SITE_URL}/clubs/4`,
      `${SITE_URL}/notices/17`,
      `${SITE_URL}/notices/10`,
    ]);
  });

  it('갱신 시각을 넣지 않는다 — 정확한 값이 없고 재생성 시각은 매일 바뀐 것처럼 보인다', async () => {
    fetchActiveClubIdsMock.mockResolvedValue([1]);
    fetchPublicNoticeIdsMock.mockResolvedValue([17]);

    const entries = await sitemap();
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true);
  });

  it('빌드 국면에서 두 목록이 모두 실패하면 정적 경로만 낸다', async () => {
    fetchActiveClubIdsMock.mockResolvedValue(null);
    fetchPublicNoticeIdsMock.mockResolvedValue(null);

    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toEqual(STATIC_URLS);
  });

  it('빌드 국면에서 한 목록만 실패하면 그 목록만 빠진다', async () => {
    fetchActiveClubIdsMock.mockResolvedValue(null);
    fetchPublicNoticeIdsMock.mockResolvedValue([17]);
    expect((await sitemap()).map((entry) => entry.url)).toEqual([
      ...STATIC_URLS,
      `${SITE_URL}/notices/17`,
    ]);

    fetchActiveClubIdsMock.mockResolvedValue([1]);
    fetchPublicNoticeIdsMock.mockResolvedValue(null);
    expect((await sitemap()).map((entry) => entry.url)).toEqual([
      ...STATIC_URLS,
      `${SITE_URL}/clubs/1`,
    ]);
  });

  it('런타임 장애는 그대로 던진다 — 직전 사이트맵을 유지한다', async () => {
    const error = new Error('점검');
    fetchActiveClubIdsMock.mockResolvedValue([1]);
    fetchPublicNoticeIdsMock.mockRejectedValue(error);

    await expect(sitemap()).rejects.toBe(error);
  });
});
