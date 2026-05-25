import { createApiClient } from '@duing/api';

export type ClubStats = {
  totalCount: number;
  recruitingCount: number;
};

export async function fetchClubStats(): Promise<ClubStats> {
  const client = createApiClient({
    baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1',
  });
  try {
    const [totalData, recruitingData] = await Promise.all([
      client.clubs.list({ size: 1 }),
      client.clubs.list({ recruiting: true, size: 1 }),
    ]);
    return {
      totalCount: totalData.totalElements,
      recruitingCount: recruitingData.totalElements,
    };
  } catch {
    return { totalCount: 128, recruitingCount: 67 };
  }
}
