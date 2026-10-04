import { createHash, timingSafeEqual } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { ApiError } from '@duing/api';

import { parsePositiveIdParam } from '@/app/_lib/idParam';
import { fetchPublicClubDetail, fetchPublicClubList } from '@/app/_lib/public-content';
import { DEFAULT_CLUB_LIST_PARAMS } from '@/app/clubs/_lib/exploreParams';

// 백엔드가 부르는 내부 재검증 경로. /clubs 는 정각 잡(ClubMetricRefreshJob)이 추천순 셔플 직후,
// /clubs/<id> 는 동아리 상세의 숨김·삭제·수정을 서버 HTML 에 바로 반영할 때(#1356) 부른다.
// 공개 주소라 서버 전용 비밀값(REVALIDATE_SECRET — NEXT_PUBLIC_ 금지)이 유일한 보호막이다.
// 허용 목록 밖 경로는 받지 않는다 — 비밀값이 새도 피해를 이 목록의 재생성으로 묶는다.
// 지우기 전에 경로마다 페이지가 다시 그릴 수 있는지 확인하고, 하나라도 그릴 수 없으면 아무것도 지우지 않는다.
// POST 만 내보낸다 — 나머지 메서드는 Next 가 405 로 답한다.
const CLUB_LIST_PATH = '/clubs';
const CLUB_DETAIL_PATH_PREFIX = `${CLUB_LIST_PATH}/`;
const MAX_PATHS = 10;
const MIN_SECRET_BYTES = 32;
const BEARER_PREFIX = 'Bearer ';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

// 해시끼리 비교해 길이가 달라도 같은 경로로 상수 시간 비교한다(길이 분기·예외 없음).
function isAuthorized(authorization: string | null, secret: string): boolean {
  if (!authorization?.startsWith(BEARER_PREFIX)) return false;
  return timingSafeEqual(sha256(authorization.slice(BEARER_PREFIX.length)), sha256(secret));
}

// 동아리 상세 경로(/clubs/<id>)의 id, 아니면 null. 페이지와 같은 판정(parsePositiveIdParam)이라 페이지가 그리는 id 는
// 전부 받고, 끝 슬래시·쿼리·이중 슬래시·0·앞자리 0·안전 정수 초과 같은 변형 주소는 받지 않는다.
function clubDetailId(path: string): number | null {
  if (!path.startsWith(CLUB_DETAIL_PATH_PREFIX)) return null;
  return parsePositiveIdParam(path.slice(CLUB_DETAIL_PATH_PREFIX.length));
}

function parsePaths(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null || !('paths' in body)) return null;
  const { paths } = body;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS) return null;
  const allowed = paths.filter(
    (path: unknown): path is string =>
      typeof path === 'string' && (path === CLUB_LIST_PATH || clubDetailId(path) !== null),
  );
  return allowed.length === paths.length ? allowed : null;
}

// 삭제 직전 사전 확인 — revalidatePath 는 캐시 삭제라 다음 요청이 직전본 없이 그 자리에서 다시 그리고, 그 렌더가
// 실패하면 그 요청이 오류다(Vercel cache-status REVALIDATED). 페이지와 같은 키·로더로 받아 보고 그릴 수 없으면
// 지우지 않는다. 주기 만료(목록 1시간·상세 24시간)가 직전본을 지킨다.
// ⚠️ 로더·fetch 에 cache: 'no-store' 를 붙이지 말 것 — 재생성이 동적 렌더로 바뀌어 ISR 이 깨진다.
// probe* 는 그릴 수 있으면 null, 아니면 사유. 조회가 던진 오류의 사유는 목록·상세가 이 분류를 함께 쓴다.
function probeErrorReason(error: unknown): string {
  if (!(error instanceof ApiError)) return 'error';
  if (error.code === 'TIMEOUT') return 'timeout';
  if (error.code === 'NETWORK') return 'network';
  // status 0 은 HTTP 상태가 아니다(빈 응답 봉투 등).
  return error.status > 0 ? `http-${error.status}` : 'error';
}

// 목록 — 실패·빈 목록이면 페이지가 스켈레톤을 그린다.
async function probeClubListFailure(): Promise<string | null> {
  try {
    const content = await fetchPublicClubList(DEFAULT_CLUB_LIST_PARAMS);
    if (content.status !== 'found') return content.status;
    return content.data.content.length > 0 ? null : 'empty';
  } catch (error) {
    return probeErrorReason(error);
  }
}

// 상세 — notFound(404·410: 숨김·삭제·승인 대기)도 그릴 수 있다. 페이지가 noindex 셸을 그리고("볼 수 없음" 은
// 클라이언트 재요청 뒤), 그 반영이 상세 재검증의 목적이다. throw·unavailable 은 장애라 그릴 수 없다.
async function probeClubDetailFailure(clubId: number): Promise<string | null> {
  try {
    const content = await fetchPublicClubDetail(clubId);
    return content.status === 'unavailable' ? content.status : null;
  } catch (error) {
    return probeErrorReason(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  // 대시보드 붙여넣기·echo 로 붙은 앞뒤 공백·개행은 비밀값이 아니다.
  const secret = (process.env.REVALIDATE_SECRET ?? '').trim();
  if (Buffer.byteLength(secret, 'utf8') < MIN_SECRET_BYTES) {
    return Response.json({ error: 'revalidation disabled' }, { status: 503 });
  }
  if (!isAuthorized(request.headers.get('authorization'), secret)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const paths = parsePaths(body);
  if (!paths) {
    return Response.json({ error: 'invalid paths' }, { status: 400 });
  }
  const revalidated = [...new Set(paths)];
  // 전부 또는 무 — 고유 경로를 순차로 확인하고 첫 실패에서 멈춘다. 허용 경로는 /clubs 와 상세뿐이다(parsePaths).
  for (const path of revalidated) {
    const clubId = clubDetailId(path);
    const probeFailure = await (clubId === null ? probeClubListFailure() : probeClubDetailFailure(clubId));
    if (probeFailure) {
      console.warn(`[revalidate] ${path} 사전 확인 실패 — 재검증 건너뜀`, { reason: probeFailure });
      return Response.json({ error: 'upstream unavailable', reason: probeFailure }, { status: 502 });
    }
  }
  for (const path of revalidated) {
    revalidatePath(path);
  }
  return Response.json({ revalidated });
}
