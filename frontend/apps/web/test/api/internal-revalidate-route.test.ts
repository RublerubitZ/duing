// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@duing/api';

import * as routeModule from '@/app/api/internal/revalidate/route';
import { DEFAULT_CLUB_LIST_PARAMS } from '@/app/clubs/_lib/exploreParams';

const { revalidatePath, fetchPublicClubList } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  fetchPublicClubList: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/app/_lib/public-content', () => ({ fetchPublicClubList }));

// 테스트 전용 더미 비밀값(38바이트) — 운영 값이 아니다.
const SECRET = 'test-only-revalidate-secret-0123456789';
const BEARER = `Bearer ${SECRET}`;
const VALID_BODY = JSON.stringify({ paths: ['/clubs'] });

// 그릴 수 있는 기본 목록(1건) — 사전 확인 통과용 최소 응답.
const RENDERABLE_LIST = {
  status: 'found',
  data: { content: [{ id: 1 }], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false },
};

function revalidateRequest(body: string, authorization?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (authorization !== undefined) headers.set('authorization', authorization);
  return new Request('http://localhost:3000/api/internal/revalidate', { method: 'POST', headers, body });
}

describe('POST /api/internal/revalidate', () => {
  beforeEach(() => {
    vi.stubEnv('REVALIDATE_SECRET', SECRET);
    revalidatePath.mockClear();
    fetchPublicClubList.mockReset();
    fetchPublicClubList.mockResolvedValue(RENDERABLE_LIST);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('허용 경로를 재검증하고 200 으로 재검증한 경로를 돌려준다', async () => {
    const response = await routeModule.POST(revalidateRequest(VALID_BODY, BEARER));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revalidated: ['/clubs'] });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith('/clubs');
    expect(fetchPublicClubList).toHaveBeenCalledTimes(1);
    expect(fetchPublicClubList).toHaveBeenCalledWith(DEFAULT_CLUB_LIST_PARAMS);
    // 사전 확인이 삭제보다 먼저다 — 그릴 수 없으면 지우지 않아야 하므로.
    expect(fetchPublicClubList.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY).toBeLessThan(
      revalidatePath.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('같은 경로가 여러 번 와도 한 번만 재검증한다', async () => {
    const response = await routeModule.POST(
      revalidateRequest(JSON.stringify({ paths: ['/clubs', '/clubs'] }), BEARER),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revalidated: ['/clubs'] });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it('환경변수 앞뒤 공백·개행은 무시한다(대시보드 붙여넣기 실수 방지)', async () => {
    vi.stubEnv('REVALIDATE_SECRET', `  ${SECRET}\n`);

    const response = await routeModule.POST(revalidateRequest(VALID_BODY, BEARER));

    expect(response.status).toBe(200);
  });

  it.each([
    ['설정되지 않음', undefined],
    ['빈 값', ''],
    ['공백뿐', '   \n'],
    ['32바이트 미만', 'x'.repeat(31)],
  ])('비밀값이 %s 이면 503 이고 재검증하지 않는다', async (_label, secret) => {
    vi.stubEnv('REVALIDATE_SECRET', secret);

    const response = await routeModule.POST(revalidateRequest(VALID_BODY, BEARER));

    expect(response.status).toBe(503);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(fetchPublicClubList).not.toHaveBeenCalled();
  });

  it.each([
    ['헤더 없음', undefined],
    ['Bearer 형식 아님', `Basic ${SECRET}`],
    ['값 틀림', `Bearer ${'y'.repeat(SECRET.length)}`],
    ['길이 다른 값', `Bearer ${SECRET}extra`],
    ['접두사만(토큰 없음)', 'Bearer'],
  ])('인증이 %s 이면 401 이고 재검증하지 않는다', async (_label, authorization) => {
    const response = await routeModule.POST(revalidateRequest(VALID_BODY, authorization));

    expect(response.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(fetchPublicClubList).not.toHaveBeenCalled();
  });

  it('인증이 틀리면 본문을 해석하기 전에 401 로 끊는다', async () => {
    const response = await routeModule.POST(revalidateRequest('{', 'Bearer wrong'));

    expect(response.status).toBe(401);
  });

  it.each([
    ['JSON 아님', '{'],
    ['null', 'null'],
    ['paths 없음', JSON.stringify({})],
    ['paths 가 배열 아님', JSON.stringify({ paths: '/clubs' })],
    ['빈 배열', JSON.stringify({ paths: [] })],
    ['11개', JSON.stringify({ paths: Array.from({ length: 11 }, () => '/clubs') })],
    ['문자열 아닌 항목', JSON.stringify({ paths: [1] })],
    ['허용 밖 경로 섞임', JSON.stringify({ paths: ['/clubs', '/notices'] })],
    ['끝 슬래시 변형', JSON.stringify({ paths: ['/clubs/'] })],
  ])('본문이 %s 이면 400 이고 재검증하지 않는다', async (_label, body) => {
    const response = await routeModule.POST(revalidateRequest(body, BEARER));

    expect(response.status).toBe(400);
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(fetchPublicClubList).not.toHaveBeenCalled();
  });

  describe('삭제 전 사전 확인 — 그릴 수 없으면 지우지 않는다', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it.each([
      ['timeout', new ApiError(0, '요청 시간이 초과되었습니다.', undefined, 'TIMEOUT')],
      ['network', new ApiError(0, '인터넷 연결을 확인해주세요.', undefined, 'NETWORK')],
      ['http-403', new ApiError(403, '요청 실패 (403)')],
      ['error', new ApiError(0, '응답이 비어 있습니다.')],
      ['error', new Error('unexpected')],
    ])('목록 조회가 실패하면(%s) 502 로 사유를 돌려주고 재검증하지 않는다', async (reason, failure) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetchPublicClubList.mockRejectedValue(failure);

      const response = await routeModule.POST(revalidateRequest(VALID_BODY, BEARER));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: 'upstream unavailable', reason });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).toContain(reason);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET);
    });

    it.each([
      ['unavailable', { status: 'unavailable' }],
      ['empty', { ...RENDERABLE_LIST, data: { ...RENDERABLE_LIST.data, content: [], totalElements: 0, totalPages: 0 } }],
    ])('목록을 그릴 수 없으면(%s) 502 로 사유를 돌려주고 재검증하지 않는다', async (reason, content) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetchPublicClubList.mockResolvedValue(content);

      const response = await routeModule.POST(revalidateRequest(VALID_BODY, BEARER));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: 'upstream unavailable', reason });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  it('HTTP 메서드는 POST 만 내보낸다 — 나머지는 Next 가 405 로 답한다', () => {
    const exportedMethods = Object.keys(routeModule).filter((key) => /^[A-Z]+$/.test(key));

    expect(exportedMethods).toEqual(['POST']);
  });
});
