import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchActiveClubIdsMock } = vi.hoisted(() => ({ fetchActiveClubIdsMock: vi.fn() }));

vi.mock('@/app/_lib/public-content', () => ({ fetchActiveClubIds: fetchActiveClubIdsMock }));

import sitemap, { revalidate } from '@/app/sitemap';
import { SITE_URL } from '@/app/_lib/site';

beforeEach(() => {
  fetchActiveClubIdsMock.mockReset();
});

describe('sitemap.xml', () => {
  it('24시간마다 다시 만든다', () => {
    expect(revalidate).toBe(86400);
  });

  it('정적 경로 뒤에 공개 동아리 상세를 붙인다', async () => {
    fetchActiveClubIdsMock.mockResolvedValue([1, 4]);

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain(`${SITE_URL}/`);
    expect(urls).toContain(`${SITE_URL}/clubs`);
    expect(urls.slice(-2)).toEqual([`${SITE_URL}/clubs/1`, `${SITE_URL}/clubs/4`]);
  });

  it('갱신 시각을 넣지 않는다 — 정확한 값이 없고 재생성 시각은 매일 바뀐 것처럼 보인다', async () => {
    fetchActiveClubIdsMock.mockResolvedValue([1]);

    const entries = await sitemap();
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(true);
  });

  it('빌드 국면 장애(null)면 정적 경로만 낸다', async () => {
    fetchActiveClubIdsMock.mockResolvedValue(null);

    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).toEqual([
      `${SITE_URL}/`,
      `${SITE_URL}/clubs`,
      `${SITE_URL}/notices`,
      `${SITE_URL}/faq`,
      `${SITE_URL}/calendar`,
      `${SITE_URL}/introduce`,
      `${SITE_URL}/terms`,
    ]);
  });
});
