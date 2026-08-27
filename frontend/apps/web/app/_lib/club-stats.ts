import { cache } from 'react';

import { createApiClient } from '@duing/api';
import type { ClubStats } from '@duing/types';

import { resolveApiBaseUrl } from './apiBaseUrl';

const apiBaseUrl = resolveApiBaseUrl(
  process.env.NEXT_PUBLIC_API_BASE_URL,
  process.env.NODE_ENV,
);

export type { ClubStats };

/**
 * 홈 히어로 문구·카테고리 카운트가 함께 쓰는 공개 통계.
 *
 * <p>예전에는 목록 조회를 `size=1` 로 두 번 던져 totalElements 만 뽑았다 — 카테고리별 수까지
 * 필요해지면서 같은 방식이면 왕복이 10회가 되므로, 서버가 한 번에 세어 주는 전용 엔드포인트로 옮겼다.
 *
 * <p>한 번의 렌더에서 여러 섹션이 호출하므로 React `cache` 로 감싼다 — 홈에서 히어로 문구와
 * 카테고리 카운트가 같은 통계를 쓰는데, 감싸지 않으면 재생성마다 같은 요청이 두 번 나간다.
 *
 * <p>백엔드 호출 실패 시 null 을 반환한다. 호출부는 null 일 때 통계 문구를 우아하게 생략한다
 * (가짜 숫자 폴백을 박지 않는다). 전 화면(홈·login·signup)이 같은 규약을 공유한다.
 */
export const fetchClubStats = cache(async (): Promise<ClubStats | null> => {
  const client = createApiClient({
    baseUrl: apiBaseUrl,
  });
  try {
    return await client.clubs.stats();
  } catch {
    return null;
  }
});
