// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@duing/api';

import * as routeModule from '@/app/api/internal/revalidate/route';
import { DEFAULT_CLUB_LIST_PARAMS } from '@/app/clubs/_lib/exploreParams';

const { revalidatePath, fetchPublicClubList, fetchPublicClubDetail } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  fetchPublicClubList: vi.fn(),
  fetchPublicClubDetail: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/app/_lib/public-content', () => ({ fetchPublicClubList, fetchPublicClubDetail }));

// 테스트 전용 더미 비밀값(38바이트) — 운영 값이 아니다.
const SECRET = 'test-only-revalidate-secret-0123456789';
const BEARER = `Bearer ${SECRET}`;
const VALID_BODY = JSON.stringify({ paths: ['/clubs'] });

// 그릴 수 있는 기본 목록(1건) — 사전 확인 통과용 최소 응답.
const RENDERABLE_LIST = {
  status: 'found',
  data: { content: [{ id: 1 }], page: 0, size: 20, totalElements: 1, totalPages: 1, hasNext: false },
};

const DETAIL_PATH = '/clubs/4';
const DETAIL_BODY = JSON.stringify({ paths: [DETAIL_PATH] });
const LIST_AND_DETAIL_BODY = JSON.stringify({ paths: ['/clubs', DETAIL_PATH] });

// 공개 동아리 상세 — 사전 확인 통과용 최소 응답.
const FOUND_DETAIL = { status: 'found', data: { id: 4 } };

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
    fetchPublicClubDetail.mockReset();
    fetchPublicClubDetail.mockResolvedValue(FOUND_DETAIL);
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

  // notFound(404·410 — 숨김·삭제·승인 대기)도 페이지가 noindex 셸로 그린다. 그 반영이 상세 재검증의 목적이다.
  it.each([
    ['found', FOUND_DETAIL],
    ['notFound', { status: 'notFound' }],
  ])('동아리 상세를 그릴 수 있으면(%s) 그 경로를 재검증하고 200 이다', async (_label, content) => {
    fetchPublicClubDetail.mockResolvedValue(content);

    const response = await routeModule.POST(revalidateRequest(DETAIL_BODY, BEARER));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revalidated: [DETAIL_PATH] });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith(DETAIL_PATH);
    expect(fetchPublicClubDetail).toHaveBeenCalledTimes(1);
    expect(fetchPublicClubDetail).toHaveBeenCalledWith(4);
    expect(fetchPublicClubList).not.toHaveBeenCalled();
    expect(fetchPublicClubDetail.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY).toBeLessThan(
      revalidatePath.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
  });

  it('같은 상세 경로가 여러 번 와도 한 번만 확인하고 한 번만 재검증한다', async () => {
    const response = await routeModule.POST(
      revalidateRequest(JSON.stringify({ paths: [DETAIL_PATH, DETAIL_PATH] }), BEARER),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revalidated: [DETAIL_PATH] });
    expect(fetchPublicClubDetail).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledTimes(1);
  });

  it('목록과 상세를 함께 받으면 둘 다 확인을 마친 뒤 둘 다 재검증한다', async () => {
    const response = await routeModule.POST(revalidateRequest(LIST_AND_DETAIL_BODY, BEARER));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ revalidated: ['/clubs', DETAIL_PATH] });
    expect(revalidatePath).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenNthCalledWith(1, '/clubs');
    expect(revalidatePath).toHaveBeenNthCalledWith(2, DETAIL_PATH);
    // 전부 또는 무 — 마지막 확인이 끝나기 전에는 아무것도 지우지 않는다.
    expect(fetchPublicClubDetail.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY).toBeLessThan(
      revalidatePath.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY,
    );
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
    ['비밀값 미설정', '', BEARER, 503],
    ['인증 실패', SECRET, 'Bearer wrong', 401],
  ])('%s 이면 상세 경로라도 백엔드를 부르지 않는다', async (_label, secret, authorization, status) => {
    vi.stubEnv('REVALIDATE_SECRET', secret);

    const response = await routeModule.POST(revalidateRequest(DETAIL_BODY, authorization));

    expect(response.status).toBe(status);
    expect(fetchPublicClubDetail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
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

  // 상세 id 는 페이지와 같은 판정(parsePositiveIdParam) — 양의 안전 정수만, 변형 주소는 받지 않는다.
  it.each([
    ['0', '/clubs/0'],
    ['앞자리 0', '/clubs/01'],
    ['전각 숫자', '/clubs/４'],
    ['끝 슬래시', '/clubs/1/'],
    ['이중 슬래시', '/clubs//1'],
    ['문자', '/clubs/abc'],
    ['음수', '/clubs/-1'],
    ['쿼리 붙음', '/clubs/4?preview=1'],
    ['목록에 쿼리 붙음', '/clubs?page=1'],
    ['안전 정수 초과', '/clubs/9007199254740992'],
  ])('경로가 %s(%s) 이면 400 이고 조회·재검증하지 않는다', async (_label, path) => {
    const response = await routeModule.POST(revalidateRequest(JSON.stringify({ paths: [path] }), BEARER));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid paths' });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(fetchPublicClubList).not.toHaveBeenCalled();
    expect(fetchPublicClubDetail).not.toHaveBeenCalled();
  });

  describe('삭제 전 사전 확인 — 그릴 수 없으면 지우지 않는다', () => {
    const PROBE_WARNING = '[revalidate] /clubs 사전 확인 실패 — 재검증 건너뜀';
    const DETAIL_PROBE_WARNING = '[revalidate] /clubs/4 사전 확인 실패 — 재검증 건너뜀';

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
      // 사유 말고는 아무것도 싣지 않는다 — 오류 객체·메시지·URL·비밀값이 런타임 로그에 남지 않게.
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(PROBE_WARNING, { reason });
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
      expect(warn).toHaveBeenCalledWith(PROBE_WARNING, { reason });
    });

    it.each([
      ['timeout', new ApiError(0, '요청 시간이 초과되었습니다.', undefined, 'TIMEOUT')],
      ['network', new ApiError(0, '인터넷 연결을 확인해주세요.', undefined, 'NETWORK')],
      ['http-503', new ApiError(503, '요청 실패 (503)')],
      ['error', new ApiError(0, '응답이 비어 있습니다.')],
      ['error', new Error('unexpected')],
    ])('상세 조회가 실패하면(%s) 502 로 사유를 돌려주고 재검증하지 않는다', async (reason, failure) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetchPublicClubDetail.mockRejectedValue(failure);

      const response = await routeModule.POST(revalidateRequest(DETAIL_BODY, BEARER));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: 'upstream unavailable', reason });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(DETAIL_PROBE_WARNING, { reason });
    });

    it('상세가 unavailable 이면 502 로 사유를 돌려주고 재검증하지 않는다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetchPublicClubDetail.mockResolvedValue({ status: 'unavailable' });

      const response = await routeModule.POST(revalidateRequest(DETAIL_BODY, BEARER));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: 'upstream unavailable', reason: 'unavailable' });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(DETAIL_PROBE_WARNING, { reason: 'unavailable' });
    });

    it('목록이 통과해도 상세를 그릴 수 없으면 아무것도 재검증하지 않는다(전부 또는 무)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetchPublicClubDetail.mockRejectedValue(new ApiError(503, '요청 실패 (503)'));

      const response = await routeModule.POST(revalidateRequest(LIST_AND_DETAIL_BODY, BEARER));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: 'upstream unavailable', reason: 'http-503' });
      expect(fetchPublicClubList).toHaveBeenCalledTimes(1);
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(DETAIL_PROBE_WARNING, { reason: 'http-503' });
    });

    it('순차로 확인해 첫 실패에서 멈춘다 — 목록을 그릴 수 없으면 상세는 조회하지 않는다', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      fetchPublicClubList.mockResolvedValue({ status: 'unavailable' });

      const response = await routeModule.POST(revalidateRequest(LIST_AND_DETAIL_BODY, BEARER));

      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toEqual({ error: 'upstream unavailable', reason: 'unavailable' });
      expect(fetchPublicClubDetail).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(PROBE_WARNING, { reason: 'unavailable' });
    });
  });

  it('HTTP 메서드는 POST 만 내보낸다 — 나머지는 Next 가 405 로 답한다', () => {
    const exportedMethods = Object.keys(routeModule).filter((key) => /^[A-Z]+$/.test(key));

    expect(exportedMethods).toEqual(['POST']);
  });
});
