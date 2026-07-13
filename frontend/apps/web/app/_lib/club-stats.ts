import { createApiClient } from '@duing/api';
import { resolveApiBaseUrl } from './apiBaseUrl';

const apiBaseUrl = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV,
);

export type ClubStats = {
  totalCount: number;
  recruitingCount: number;
};

// 백엔드 호출 실패 시 null 을 반환한다. 호출부는 null 일 때 통계 문구를
// 우아하게 생략한다(가짜 숫자 폴백을 박지 않는다).
export async function fetchClubStats(): Promise<ClubStats | null> {
  const client = createApiClient({
    baseUrl: apiBaseUrl,
  });
  try {
    const [totalData, recruitingData] = await Promise.all([
      client.clubs.list({ size: 1 }),
      client.clubs.list({ recruitmentStatus: 'AVAILABLE', size: 1 }),
    ]);
    return {
      totalCount: totalData.totalElements,
      recruitingCount: recruitingData.totalElements,
    };
  } catch {
    return null;
  }
}
