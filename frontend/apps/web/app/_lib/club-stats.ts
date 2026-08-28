import { cache } from 'react';

import { createApiClient } from '@duing/api';
import type { ClubStats } from '@duing/types';

import { resolveApiBaseUrl } from './apiBaseUrl';
import { shouldRethrowBackendFailure } from './fail-soft';

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
 * <p>실패 정책은 다른 공개 로더와 같다(`shouldRethrowBackendFailure`). 빌드·development 는 null 로
 * 폴백해 BE 없이도 배포·로컬 구동이 되고, production 런타임(=ISR 재생성)에서는 rethrow 한다.
 *
 * <p>예전에는 이 로더만 전 국면 swallow 였다. "rethrow 하면 빌드가 깨진다"는 이유였는데,
 * 판별 함수가 이미 빌드 국면을 빼주므로 성립하지 않는 걱정이었다. 그대로 두면 재생성 중 BE 순단이
 * "성공"으로 처리돼 통계가 빠진 홈이 600초 캐시된다 — 특히 카테고리 개수까지 이 로더에 얹힌 뒤로는
 * 사라지는 정보가 문구 한 줄이 아니다. rethrow 하면 직전 정상 캐시본이 그대로 서빙된다.
 *
 * <p>null 을 받은 호출부는 통계 문구·개수를 우아하게 생략한다(가짜 숫자 폴백을 박지 않는다) —
 * 빌드 국면과 로컬에서 여전히 유효한 경로다.
 */
export const fetchClubStats = cache(async (): Promise<ClubStats | null> => {
  const client = createApiClient({
    baseUrl: apiBaseUrl,
  });
  try {
    return await client.clubs.stats();
  } catch (error) {
    if (shouldRethrowBackendFailure()) throw error;
    return null;
  }
});
