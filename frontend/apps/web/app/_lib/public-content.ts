import { cache } from 'react';

import { ApiError, createApiClient } from '@duing/api';
import type { ClubDetail } from '@duing/types';

import { resolveApiBaseUrl } from './apiBaseUrl';
import { shouldRethrowBackendFailure } from './fail-soft';

const apiBaseUrl = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV);

// 서버 전용 익명 클라이언트 — 쿠키·토큰이 없어 공개 데이터만 받는다(ISR 캐시에 회원 시야가 섞이지 않는다).
function client() {
  return createApiClient({ baseUrl: apiBaseUrl });
}

/**
 * 서버 렌더(24시간 ISR)용 공개 콘텐츠 조회 결과.
 * - found: 공개 데이터
 * - notFound: 없거나 공개되지 않은 자원(삭제·승인 대기 등) — 페이지는 noindex 셸을 낸다
 * - unavailable: 빌드 국면의 일시 장애 — 셸만 렌더하고 색인 신호는 건드리지 않는다
 * 런타임(재생성)의 일시 장애는 결과로 돌려주지 않고 throw 한다 — Next 가 직전 캐시본을 계속 서빙한다(fail-soft.ts).
 */
export type PublicContent<T> =
  | { status: 'found'; data: T }
  | { status: 'notFound' }
  | { status: 'unavailable' };

// 공개 API 는 볼 수 없는 자원(승인 대기·비활성·삭제)도 열거 방지로 404 를 준다. 그 밖의 4xx 는 장애로 본다 —
// 형식이 틀린 id 는 페이지가 호출 전에 거르고(parsePositiveIdParam), 403 은 Cloudflare WAF·봇 챌린지일 수 있다.
// 장애를 notFound 로 받으면 noindex 셸이 24시간 캐시돼 직전 정상본까지 잃는다.
const NOT_FOUND_STATUSES: ReadonlySet<number> = new Set([404, 410]);

async function loadPublicContent<T>(load: () => Promise<T>): Promise<PublicContent<T>> {
  try {
    return { status: 'found', data: await load() };
  } catch (error) {
    if (error instanceof ApiError && NOT_FOUND_STATUSES.has(error.status)) {
      return { status: 'notFound' };
    }
    if (shouldRethrowBackendFailure()) throw error;
    return { status: 'unavailable' };
  }
}

/** 공개 동아리 상세 — generateMetadata 와 페이지가 같은 요청을 한 번만 보내도록 렌더 단위로 캐시한다. */
export const fetchPublicClubDetail = cache(
  (clubId: number): Promise<PublicContent<ClubDetail>> =>
    loadPublicContent(() => client().clubs.detail(clubId)),
);

// 백엔드 페이지 크기 상한(PageableConfig max 100).
const CLUB_ID_PAGE_SIZE = 100;
// 순회 상한(100 × 50 = 5,000곳) — 응답 이상으로 hasNext 가 끝나지 않을 때의 안전장치. 동아리는 현재 166곳.
const CLUB_ID_MAX_PAGES = 50;

/**
 * 사이트맵용 공개(ACTIVE) 동아리 id 전부. 이름순으로 순회한다 — 기본 추천순은 시간 단위로 바뀌어 페이지를
 * 넘기는 동안 순서가 흔들릴 수 있다. 빌드 국면 장애면 null(정적 경로만), 런타임 장애는 throw.
 */
export async function fetchActiveClubIds(): Promise<number[] | null> {
  try {
    const api = client();
    const clubIds: number[] = [];
    for (let page = 0; page < CLUB_ID_MAX_PAGES; page += 1) {
      const result = await api.clubs.list({ sort: 'ALPHABETICAL', size: CLUB_ID_PAGE_SIZE, page });
      clubIds.push(...result.content.map((club) => club.id));
      if (!result.hasNext) break;
    }
    // 순회 도중 이름이 바뀌면 이름순 경계가 밀려 같은 id 가 두 번 잡힐 수 있다 — 사이트맵 중복 URL 방지
    return [...new Set(clubIds)];
  } catch (error) {
    if (shouldRethrowBackendFailure()) throw error;
    return null;
  }
}
