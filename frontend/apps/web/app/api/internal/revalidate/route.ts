import { createHash, timingSafeEqual } from 'node:crypto';

import { revalidatePath } from 'next/cache';

// 백엔드 정각 잡(ClubMetricRefreshJob)이 추천순 셔플 직후 부르는 내부 재검증 경로.
// 공개 주소라 서버 전용 비밀값(REVALIDATE_SECRET — NEXT_PUBLIC_ 금지)이 유일한 보호막이다.
// 허용 목록 밖 경로는 받지 않는다 — 비밀값이 새도 피해를 이 목록의 재생성으로 묶는다.
// POST 만 내보낸다 — 나머지 메서드는 Next 가 405 로 답한다.
const REVALIDATABLE_PATHS: ReadonlySet<string> = new Set(['/clubs']);
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

function parsePaths(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null || !('paths' in body)) return null;
  const { paths } = body;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS) return null;
  const allowed = paths.filter(
    (path: unknown): path is string => typeof path === 'string' && REVALIDATABLE_PATHS.has(path),
  );
  return allowed.length === paths.length ? allowed : null;
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
  for (const path of revalidated) {
    revalidatePath(path);
  }
  return Response.json({ revalidated });
}
