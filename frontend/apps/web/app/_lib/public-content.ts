import { cache } from 'react';

import { ApiError, createApiClient } from '@duing/api';
import type {
  ClubDetail,
  ClubSearchParams,
  ClubSummary,
  NoticeCardItem,
  NoticeDetail,
  NoticeSource,
  PageResponse,
} from '@duing/types';

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

/**
 * 공개 동아리 목록 한 페이지 — 익명이라 백엔드가 공개(ACTIVE) 동아리만 준다. 탐색 화면이 쿼리 없는 첫 진입 키로
 * 시드하고, 같은 데이터로 서버 렌더 기본 목록(Suspense fallback)을 그린다.
 */
export function fetchPublicClubList(params: ClubSearchParams): Promise<PublicContent<PageResponse<ClubSummary>>> {
  return loadPublicContent(() => client().clubs.list(params));
}

/**
 * 공개 소식 상세 — 동아리 상세와 같은 정책. 익명 조회라 동아리 공지(CLUB_SCOPED)는 404(notFound)가 되고,
 * 만료된 공개 소식은 200 이라 그대로 렌더한다(만료 표시는 하이드레이션 뒤).
 */
export const fetchPublicNoticeDetail = cache(
  (noticeId: number): Promise<PublicContent<NoticeDetail>> =>
    loadPublicContent(() => client().notices.detail(noticeId)),
);

// 목록 로더 — 목록에는 "없음"이 없어 404 를 포함한 모든 실패를 장애로 본다. 상세처럼 404 를 notFound 로 받으면
// 페이지가 셸을 그리고 재생성이 성공한 것으로 처리돼 직전 정상본을 잃는다(셸이 재생성 주기만큼 캐시된다).
async function loadPublicList<T>(load: () => Promise<T>): Promise<PublicContent<T>> {
  try {
    return { status: 'found', data: await load() };
  } catch (error) {
    if (shouldRethrowBackendFailure()) throw error;
    return { status: 'unavailable' };
  }
}

/**
 * 공개 소식 목록 한 페이지 — 익명이라 백엔드가 PUBLIC·미만료만 준다. 목록 화면이 첫 진입 키로 시드한다.
 */
export function fetchPublicNoticeList(params: {
  source: NoticeSource;
  page: number;
  size: number;
}): Promise<PublicContent<PageResponse<NoticeCardItem>>> {
  return loadPublicList(() => client().notices.list(params));
}

// 백엔드 페이지 크기 상한(PageableConfig max 100).
const ID_PAGE_SIZE = 100;
// 순회 상한(100 × 50 = 5,000건) — 응답 이상으로 hasNext 가 끝나지 않을 때의 안전장치.
const ID_MAX_PAGES = 50;

/**
 * 사이트맵용 — 목록 API 를 hasNext 가 끝날 때까지 순회해 id 를 모은다.
 * 빌드 국면 장애면 null(사이트맵에서 그 목록만 빠짐), 런타임 장애는 throw(직전 사이트맵 유지).
 */
async function collectIds(
  loadPage: (page: number) => Promise<PageResponse<{ id: number }>>,
): Promise<number[] | null> {
  try {
    const ids: number[] = [];
    for (let page = 0; page < ID_MAX_PAGES; page += 1) {
      const result = await loadPage(page);
      ids.push(...result.content.map((item) => item.id));
      if (!result.hasNext) break;
    }
    // 순회 도중 정렬 경계가 밀리면 같은 id 가 두 번 잡힐 수 있다 — 사이트맵 중복 URL 방지
    return [...new Set(ids)];
  } catch (error) {
    if (shouldRethrowBackendFailure()) throw error;
    return null;
  }
}

/**
 * 사이트맵용 공개(ACTIVE) 동아리 id 전부. 이름순으로 순회한다 — 기본 추천순은 시간 단위로 바뀌어 페이지를
 * 넘기는 동안 순서가 흔들릴 수 있다. 동아리는 현재 166곳.
 */
export function fetchActiveClubIds(): Promise<number[] | null> {
  const api = client();
  return collectIds((page) => api.clubs.list({ sort: 'ALPHABETICAL', size: ID_PAGE_SIZE, page }));
}

/** 사이트맵용 공개 소식 id 전부 — 익명 목록은 백엔드가 PUBLIC·미만료만 준다(동아리 공지·만료 소식 제외). */
export function fetchPublicNoticeIds(): Promise<number[] | null> {
  const api = client();
  return collectIds((page) => api.notices.list({ page, size: ID_PAGE_SIZE }));
}
