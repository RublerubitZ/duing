import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubSummary, FederationFaqCategory, FederationFaqItem, NoticeCardItem, PageResponse } from '@duing/types';

// createApiClient 만 모킹하고 ApiError 는 실제 클래스를 쓴다 — 실패 정책이 instanceof 로 상태를 가른다.
const {
  createApiClientMock,
  clubsDetailMock,
  clubsListMock,
  clubsHeroActivitiesMock,
  noticesDetailMock,
  noticesListMock,
  federationFaqsListMock,
  federationFaqCategoriesListMock,
} = vi.hoisted(() => ({
  createApiClientMock: vi.fn(),
  clubsDetailMock: vi.fn(),
  clubsListMock: vi.fn(),
  clubsHeroActivitiesMock: vi.fn(),
  noticesDetailMock: vi.fn(),
  noticesListMock: vi.fn(),
  federationFaqsListMock: vi.fn(),
  federationFaqCategoriesListMock: vi.fn(),
}));

vi.mock('@duing/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@duing/api')>();
  return { ...actual, createApiClient: createApiClientMock };
});

import { ApiError } from '@duing/api';

import {
  fetchActiveClubIds,
  fetchPublicClubDetail,
  fetchPublicClubHeroActivities,
  fetchPublicClubList,
  fetchPublicFaqCategories,
  fetchPublicFaqList,
  fetchPublicNoticeDetail,
  fetchPublicNoticeIds,
  fetchPublicNoticeList,
} from '@/app/_lib/public-content';

/** 실패 정책 분기의 입력인 두 환경변수만 고정한다. */
function stubPhase(nodeEnv: string, nextPhase?: string) {
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PHASE', nextPhase);
}

function clubPage(ids: number[], hasNext: boolean, page: number): PageResponse<Pick<ClubSummary, 'id'>> {
  return {
    content: ids.map((id) => ({ id })),
    page,
    size: 100,
    totalElements: ids.length,
    totalPages: 1,
    hasNext,
  };
}

function noticePage(ids: number[], hasNext: boolean, page: number): PageResponse<Pick<NoticeCardItem, 'id'>> {
  return {
    content: ids.map((id) => ({ id })),
    page,
    size: 100,
    totalElements: ids.length,
    totalPages: 1,
    hasNext,
  };
}

function faqPage(questions: string[]): PageResponse<FederationFaqItem> {
  return {
    content: questions.map((question, index) => ({
      id: index + 1,
      categoryId: 1,
      categoryName: '두잉 이용',
      question,
      answer: `${question} — 답변`,
      pinned: false,
    })),
    page: 0,
    size: 20,
    totalElements: questions.length,
    totalPages: 1,
    hasNext: false,
  };
}

beforeEach(() => {
  createApiClientMock.mockReset();
  clubsDetailMock.mockReset();
  clubsListMock.mockReset();
  clubsHeroActivitiesMock.mockReset();
  noticesDetailMock.mockReset();
  noticesListMock.mockReset();
  federationFaqsListMock.mockReset();
  federationFaqCategoriesListMock.mockReset();
  createApiClientMock.mockReturnValue({
    clubs: { detail: clubsDetailMock, list: clubsListMock, heroActivities: clubsHeroActivitiesMock },
    notices: { detail: noticesDetailMock, list: noticesListMock },
    federationFaqs: { list: federationFaqsListMock },
    federationFaqCategories: { list: federationFaqCategoriesListMock },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('fetchPublicClubDetail', () => {
  it('공개 동아리는 found 로 돌려준다', async () => {
    const club = { id: 4, name: '비호상록회' };
    clubsDetailMock.mockResolvedValue(club);

    await expect(fetchPublicClubDetail(4)).resolves.toEqual({ status: 'found', data: club });
    expect(clubsDetailMock).toHaveBeenCalledWith(4);
  });

  it.each([404, 410])('%i 는 없음·비공개라 notFound — 런타임에도 throw 하지 않는다', async (status) => {
    stubPhase('production');
    clubsDetailMock.mockRejectedValue(new ApiError(status, '없음'));

    await expect(fetchPublicClubDetail(4)).resolves.toEqual({ status: 'notFound' });
  });

  // 400·403 도 장애로 본다 — 형식이 틀린 id 는 페이지가 호출 전에 거르고(parsePositiveIdParam), 동아리 상세는
  // 숨김 상태를 모두 404 로 준다. 그 밖의 403 은 Cloudflare WAF·봇 챌린지일 수 있어 noindex 로 굳히면 안 된다.
  it.each([
    ['5xx', new ApiError(503, '점검')],
    ['429', new ApiError(429, '요청 과다')],
    ['403(WAF 챌린지 가능)', new ApiError(403, '차단')],
    ['400', new ApiError(400, '잘못된 요청')],
    ['타임아웃', new ApiError(0, '시간 초과', undefined, 'TIMEOUT')],
  ])('런타임(재생성)의 일시 장애(%s)는 throw 해 직전 캐시본을 지킨다', async (_label, error) => {
    stubPhase('production');
    clubsDetailMock.mockRejectedValue(error);

    await expect(fetchPublicClubDetail(4)).rejects.toBe(error);
  });

  it('빌드 국면의 일시 장애는 unavailable — 셸만 렌더하고 색인 신호는 건드리지 않는다', async () => {
    stubPhase('production', 'phase-production-build');
    clubsDetailMock.mockRejectedValue(new ApiError(503, '점검'));

    await expect(fetchPublicClubDetail(4)).resolves.toEqual({ status: 'unavailable' });
  });

  it('빌드 국면에서도 404 는 notFound — 장애 폴백(unavailable)으로 흐리지 않는다', async () => {
    stubPhase('production', 'phase-production-build');
    clubsDetailMock.mockRejectedValue(new ApiError(404, '없음'));

    await expect(fetchPublicClubDetail(4)).resolves.toEqual({ status: 'notFound' });
  });

  it('ApiError 가 아닌 예외도 장애 — 런타임은 같은 객체로 rethrow, 빌드 국면은 unavailable', async () => {
    const error = new TypeError('boom');
    clubsDetailMock.mockRejectedValue(error);

    stubPhase('production');
    await expect(fetchPublicClubDetail(4)).rejects.toBe(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicClubDetail(4)).resolves.toEqual({ status: 'unavailable' });
  });
});

describe('fetchPublicClubHeroActivities', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('대표 활동 목록을 그대로 돌려준다', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const heroActivities = [{ id: 1, title: '정기 공연' }];
    clubsHeroActivitiesMock.mockResolvedValue(heroActivities);

    await expect(fetchPublicClubHeroActivities(4)).resolves.toEqual(heroActivities);
    expect(clubsHeroActivitiesMock).toHaveBeenCalledWith(4);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  // 상세(fail-soft)와 다른 정책 — 보조 섹션이라 런타임에서도 던지지 않는다. 던지면 블로킹 첫 렌더가 오류 화면이 된다.
  it.each([
    ['5xx', new ApiError(503, '점검')],
    ['타임아웃', new ApiError(0, '시간 초과', undefined, 'TIMEOUT')],
    ['ApiError 가 아닌 예외', new TypeError('fetch failed')],
  ])('실패(%s)는 런타임·빌드 국면 모두 null 로 강등하고 국면마다 경고를 1줄 남긴다', async (_label, error) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    clubsHeroActivitiesMock.mockRejectedValue(error);

    stubPhase('production');
    await expect(fetchPublicClubHeroActivities(4)).resolves.toBeNull();
    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicClubHeroActivities(4)).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(String(warnSpy.mock.calls[0]?.[0])).toMatch(/^\[public-content\] 대표 활동 조회 실패 — 시드 없이 강등/);
  });

  // 404·410 은 숨김·없는 동아리의 정상 결과다(상세의 notFound 와 같은 판정) — 경고하면 진짜 장애 신호가 묻힌다.
  it.each([404, 410])('%i 는 런타임·빌드 국면 모두 경고 없이 null 로 강등한다', async (status) => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    clubsHeroActivitiesMock.mockRejectedValue(new ApiError(status, '없음'));

    stubPhase('production');
    await expect(fetchPublicClubHeroActivities(4)).resolves.toBeNull();
    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicClubHeroActivities(4)).resolves.toBeNull();

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('fetchActiveClubIds', () => {
  it('이름순 100개씩 hasNext 가 끝날 때까지 순회해 id 를 모은다', async () => {
    clubsListMock
      .mockResolvedValueOnce(clubPage([1, 2], true, 0))
      .mockResolvedValueOnce(clubPage([3], false, 1));

    await expect(fetchActiveClubIds()).resolves.toEqual([1, 2, 3]);
    expect(clubsListMock).toHaveBeenNthCalledWith(1, { sort: 'ALPHABETICAL', size: 100, page: 0 });
    expect(clubsListMock).toHaveBeenNthCalledWith(2, { sort: 'ALPHABETICAL', size: 100, page: 1 });
  });

  it('페이지가 겹쳐 같은 id 가 두 번 와도 한 번만 돌려준다', async () => {
    clubsListMock
      .mockResolvedValueOnce(clubPage([1, 2], true, 0))
      .mockResolvedValueOnce(clubPage([2, 3], false, 1));

    await expect(fetchActiveClubIds()).resolves.toEqual([1, 2, 3]);
  });

  it('빌드 국면 장애면 null — 사이트맵은 정적 경로만 낸다', async () => {
    stubPhase('production', 'phase-production-build');
    clubsListMock.mockRejectedValue(new ApiError(503, '점검'));

    await expect(fetchActiveClubIds()).resolves.toBeNull();
  });

  it('런타임 장애면 throw — 직전 사이트맵을 유지한다', async () => {
    stubPhase('production');
    const error = new ApiError(503, '점검');
    clubsListMock.mockRejectedValue(error);

    await expect(fetchActiveClubIds()).rejects.toBe(error);
  });
});

describe('fetchPublicNoticeDetail', () => {
  it('공개 소식은 found 로 돌려준다', async () => {
    const notice = { id: 42, title: '봄 축제 공지' };
    noticesDetailMock.mockResolvedValue(notice);

    await expect(fetchPublicNoticeDetail(42)).resolves.toEqual({ status: 'found', data: notice });
    expect(noticesDetailMock).toHaveBeenCalledWith(42);
  });

  // 백엔드는 비로그인에게 동아리 공지(CLUB_SCOPED)와 없는 소식을 똑같이 404 로 준다(열거 방지).
  it('404 는 notFound — 동아리 공지도 여기로 온다', async () => {
    stubPhase('production');
    noticesDetailMock.mockRejectedValue(new ApiError(404, '없음'));

    await expect(fetchPublicNoticeDetail(42)).resolves.toEqual({ status: 'notFound' });
  });

  it('403 은 장애 — 런타임에 throw 해 직전 캐시본을 지킨다(WAF 챌린지일 수 있다)', async () => {
    stubPhase('production');
    const error = new ApiError(403, '차단');
    noticesDetailMock.mockRejectedValue(error);

    await expect(fetchPublicNoticeDetail(42)).rejects.toBe(error);
  });
});

describe('fetchPublicNoticeIds', () => {
  it('100개씩 hasNext 가 끝날 때까지 순회해 id 를 모으고 겹친 id 는 한 번만 돌려준다', async () => {
    noticesListMock
      .mockResolvedValueOnce(noticePage([17, 16], true, 0))
      .mockResolvedValueOnce(noticePage([16, 15], false, 1));

    await expect(fetchPublicNoticeIds()).resolves.toEqual([17, 16, 15]);
    expect(noticesListMock).toHaveBeenNthCalledWith(1, { page: 0, size: 100 });
    expect(noticesListMock).toHaveBeenNthCalledWith(2, { page: 1, size: 100 });
  });

  it('빌드 국면 장애면 null, 런타임 장애면 throw', async () => {
    const error = new ApiError(503, '점검');
    noticesListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicNoticeIds()).resolves.toBeNull();

    stubPhase('production');
    await expect(fetchPublicNoticeIds()).rejects.toBe(error);
  });
});

describe('fetchPublicNoticeList', () => {
  it('받은 조건 그대로 한 페이지를 조회해 found 로 돌려준다', async () => {
    const page = noticePage([17, 16], false, 0);
    noticesListMock.mockResolvedValue(page);

    await expect(fetchPublicNoticeList({ source: 'SCHOOL', page: 0, size: 20 })).resolves.toEqual({
      status: 'found',
      data: page,
    });
    expect(noticesListMock).toHaveBeenCalledWith({ source: 'SCHOOL', page: 0, size: 20 });
  });

  it('빌드 국면 장애면 unavailable(셸), 런타임 장애면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(503, '점검');
    noticesListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicNoticeList({ source: 'SCHOOL', page: 0, size: 20 })).resolves.toEqual({
      status: 'unavailable',
    });

    stubPhase('production');
    await expect(fetchPublicNoticeList({ source: 'SCHOOL', page: 0, size: 20 })).rejects.toBe(error);
  });

  it('목록에는 "없음"이 없다 — 404 도 빌드 국면이면 unavailable, 런타임이면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(404, 'Not Found');
    noticesListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicNoticeList({ source: 'SCHOOL', page: 0, size: 20 })).resolves.toEqual({
      status: 'unavailable',
    });

    stubPhase('production');
    await expect(fetchPublicNoticeList({ source: 'SCHOOL', page: 0, size: 20 })).rejects.toBe(error);
  });
});

describe('fetchPublicClubList', () => {
  it('받은 조건 그대로 한 페이지를 조회해 found 로 돌려준다', async () => {
    const page = clubPage([1, 4], true, 0);
    clubsListMock.mockResolvedValue(page);

    await expect(fetchPublicClubList({ page: 0, size: 20 })).resolves.toEqual({ status: 'found', data: page });
    expect(clubsListMock).toHaveBeenCalledWith({ page: 0, size: 20 });
  });

  it('빌드 국면 장애면 unavailable(스켈레톤), 런타임 장애면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(503, '점검');
    clubsListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicClubList({ page: 0, size: 20 })).resolves.toEqual({ status: 'unavailable' });

    stubPhase('production');
    await expect(fetchPublicClubList({ page: 0, size: 20 })).rejects.toBe(error);
  });

  it('목록에는 "없음"이 없다 — 404 도 빌드 국면이면 unavailable, 런타임이면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(404, 'Not Found');
    clubsListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicClubList({ page: 0, size: 20 })).resolves.toEqual({ status: 'unavailable' });

    stubPhase('production');
    await expect(fetchPublicClubList({ page: 0, size: 20 })).rejects.toBe(error);
  });
});

describe('fetchPublicFaqList', () => {
  it('받은 조건 그대로 한 페이지를 조회해 found 로 돌려준다', async () => {
    const page = faqPage(['동아리는 어떻게 가입하나요?', '회비는 어디서 확인하나요?']);
    federationFaqsListMock.mockResolvedValue(page);

    await expect(fetchPublicFaqList({ page: 0, size: 20 })).resolves.toEqual({ status: 'found', data: page });
    expect(federationFaqsListMock).toHaveBeenCalledWith({ page: 0, size: 20 });
  });

  it('빌드 국면 장애면 unavailable(셸), 런타임 장애면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(503, '점검');
    federationFaqsListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicFaqList({ page: 0, size: 20 })).resolves.toEqual({ status: 'unavailable' });

    stubPhase('production');
    await expect(fetchPublicFaqList({ page: 0, size: 20 })).rejects.toBe(error);
  });

  it('목록에는 "없음"이 없다 — 404 도 빌드 국면이면 unavailable, 런타임이면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(404, 'Not Found');
    federationFaqsListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicFaqList({ page: 0, size: 20 })).resolves.toEqual({ status: 'unavailable' });

    stubPhase('production');
    await expect(fetchPublicFaqList({ page: 0, size: 20 })).rejects.toBe(error);
  });
});

describe('fetchPublicFaqCategories', () => {
  it('공개 카테고리 목록을 found 로 돌려준다', async () => {
    const categories: FederationFaqCategory[] = [
      { id: 1, name: '두잉 이용', sortOrder: 1 },
      { id: 2, name: '동아리 등록', sortOrder: 2 },
    ];
    federationFaqCategoriesListMock.mockResolvedValue(categories);

    await expect(fetchPublicFaqCategories()).resolves.toEqual({ status: 'found', data: categories });
    expect(federationFaqCategoriesListMock).toHaveBeenCalledTimes(1);
  });

  it('빌드 국면 장애면 unavailable, 런타임 장애면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(503, '점검');
    federationFaqCategoriesListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicFaqCategories()).resolves.toEqual({ status: 'unavailable' });

    stubPhase('production');
    await expect(fetchPublicFaqCategories()).rejects.toBe(error);
  });

  it('목록에는 "없음"이 없다 — 404 도 빌드 국면이면 unavailable, 런타임이면 throw(직전 캐시본 유지)', async () => {
    const error = new ApiError(404, 'Not Found');
    federationFaqCategoriesListMock.mockRejectedValue(error);

    stubPhase('production', 'phase-production-build');
    await expect(fetchPublicFaqCategories()).resolves.toEqual({ status: 'unavailable' });

    stubPhase('production');
    await expect(fetchPublicFaqCategories()).rejects.toBe(error);
  });
});
