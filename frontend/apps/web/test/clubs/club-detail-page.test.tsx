import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ClubDetail, ClubHeroActivity } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys } from '@duing/hooks';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/clubs/1',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import { ClubDetailPage } from '@/app/clubs/[clubId]/_pages/ClubDetailPage';

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

const recruitment: NonNullable<ClubDetail['activeRecruitment']> = {
  id: 100,
  recruitmentId: 100,
  title: '2026 신입 모집',
  startDate: '2026-06-01',
  endDate: '2026-06-30',
  displayStatus: 'OPEN',
  capacity: 20,
  useInterview: false,
  targetRole: 'MEMBER',
  applicationMode: 'SELF',
  externalFormUrl: null,
  interviewStartDate: null,
  interviewEndDate: null,
  applicantCount: null,
};

const clubDetail: ClubDetail = {
  id: CLUB_ID,
  name: '두잉',
  category: 'ACADEMIC',
  division: null,
  college: null,
  department: null,
  logoUrl: null,
  status: 'ACTIVE',
  tags: [],
  centralClub: false,
  description: '동아리 본문 소개',
  coverUrl: null,
  snsLinks: [],
  faqs: [],
  leaderId: null,
  leaderName: null,
  photos: [],
  foundedYear: 2020,
  cohortNumber: null,
  location: null,
  contactPhone: null,
  contactVisibility: 'PUBLIC',
  activityFrequency: null,
  activeDays: [],
  membershipFeeAmount: null,
  feeCycle: 'NONE',
  feeNote: null,
  tagline: null,
  highlights: [],
  projects: [{ icon: 'CODE', title: '해커톤', subtitle: '2박 3일 개발' }],
  useGeneration: false,
  activeRecruitment: recruitment,
};

function makeHero(id: number, displayOrder: number): ClubHeroActivity {
  return {
    id,
    clubPhotoId: id * 10,
    storageKey: `key/${id}.jpg`,
    caption: null,
    width: null,
    height: null,
    title: `히어로${id}`,
    description: `설명${id}`,
    displayOrder,
  };
}

function envelope(data: unknown) {
  return HttpResponse.json({ ok: true, message: null, data });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// 상세만 실패시키는 시드 — 부수 요청(사진·조회 비콘)은 정상이라 분기 판정이 상세 쿼리 하나에만 걸린다.
function seedDetailStatus(status: number) {
  server.use(
    http.get(`*/clubs/${CLUB_ID}`, () => new HttpResponse(null, { status })),
    http.get(`*/clubs/${CLUB_ID}/photos`, () => envelope([])),
    http.post(`*/clubs/${CLUB_ID}/views`, () => new HttpResponse(null, { status: 204 })),
  );
}

function seed(options: { heroFails?: boolean } = {}) {
  server.use(
    http.get(`*/clubs/${CLUB_ID}`, () => envelope(clubDetail)),
    http.get(`*/clubs/${CLUB_ID}/photos`, () => envelope([])),
    http.get(`*/clubs/${CLUB_ID}/hero-activities`, () =>
      options.heroFails
        ? new HttpResponse(null, { status: 500 })
        : envelope([makeHero(1, 1), makeHero(2, 2)]),
    ),
    // 상세 진입 시 나가는 관심도 집계 비콘 — 이 파일의 관심사는 아니지만, 페이지가 실제로 보내는
    // 요청이라 핸들러를 선언해 둔다(동작 검증은 club-view-beacon.test.tsx).
    http.post(`*/clubs/${CLUB_ID}/views`, () => new HttpResponse(null, { status: 204 })),
  );
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

// 캐시 재방문은 상세를 미리 채운 QueryClient 를 넘겨 흉내 낸다.
function renderPage(queryClient: QueryClient = createQueryClient()) {
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ClubDetailPage clubId={CLUB_ID} />
        </ToastProvider>
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

// a 가 b 앞에 오면 true (DOCUMENT_POSITION_FOLLOWING = 4).
function isBefore(first: Element, second: Element): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('동아리 상세 page 랜딩 조립', () => {
  it('랜딩 두 섹션(대표 활동·이런 활동을 해요)이 소개 탭패널 안에서 렌더된다', async () => {
    seed();
    renderPage();

    const heroHeading = await screen.findByRole('heading', { name: '대표 활동' });
    const introHeading = screen.getByRole('heading', { name: '이런 활동을 해요' });
    const tabpanel = screen.getByRole('tabpanel');

    expect(tabpanel).toContainElement(heroHeading);
    expect(tabpanel).toContainElement(introHeading);
  });

  it('데스크탑 우측 신청 패널은 sticky·self-start 컬럼 안에 있다', async () => {
    seed();
    renderPage();

    // '모집 인원'은 데스크탑 풀 카드에만 있는 라벨(모바일 요약은 '인원').
    const capacityLabel = await screen.findByText('모집 인원');
    const stickyColumn = capacityLabel.closest('.lg\\:self-start');

    expect(stickyColumn).not.toBeNull();
    // grid stretch 가 sticky 를 무력화하지 않도록 self-start 가 함께 있어야 한다.
    expect(stickyColumn).toHaveClass('lg:sticky', 'lg:top-6', 'lg:self-start');
  });

  it('모바일 모집 요약이 탭리스트보다 DOM 앞에 온다', async () => {
    seed();
    renderPage();

    const summary = await screen.findByRole('region', { name: '모집 정보' });
    const tablist = screen.getByRole('tablist');

    expect(isBefore(summary, tablist)).toBe(true);
  });

  it('hero API 500 이어도 페이지 본문은 렌더되고 소개 탭 안에 대표 활동 헤더는 없다', async () => {
    seed({ heroFails: true });
    renderPage();

    // 본문이 뜰 때까지 대기 — 탭리스트가 렌더되면 상세 본문 게이트를 통과한 것.
    const tablist = await screen.findByRole('tablist');
    expect(tablist).toBeInTheDocument();
    // Stats(창설년도 셀)도 정상.
    expect(screen.getByText('창설년도')).toBeInTheDocument();

    const tabpanel = screen.getByRole('tabpanel');
    // hero 실패는 조용히 강등 — 소개 탭 안 대표 활동 헤더 부재.
    expect(within(tabpanel).queryByRole('heading', { name: '대표 활동' })).not.toBeInTheDocument();
    // 소개 탭 본문(소개글·이런 활동을 해요)은 정상 렌더.
    expect(within(tabpanel).getByText('동아리 본문 소개')).toBeInTheDocument();
    expect(within(tabpanel).getByRole('heading', { name: '이런 활동을 해요' })).toBeInTheDocument();
    // hero 쿼리가 500 으로 정착하면 스켈레톤도 남지 않는다(로딩이 걸려 있지 않음).
    await waitFor(() =>
      expect(
        screen.queryByRole('status', { name: '대표 활동 불러오는 중' }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe('동아리 상세 실패 분기', () => {
  it('404 는 "볼 수 없음" 화면을 띄운다', async () => {
    seedDetailStatus(404);
    renderPage();

    expect(
      await screen.findByRole('heading', { name: '이 동아리는 지금 볼 수 없어요' }),
    ).toBeInTheDocument();
    expect(screen.getByText('삭제됐거나 승인 대기 중일 수 있어요.')).toBeInTheDocument();
  });

  it('500 은 중립 오류 문구를 띄우고 "삭제됐거나" 라고 단정하지 않는다', async () => {
    seedDetailStatus(500);
    renderPage();

    expect(await screen.findByText('동아리 정보를 불러오지 못했습니다.')).toBeInTheDocument();
    expect(screen.queryByText(/삭제됐거나/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '이 동아리는 지금 볼 수 없어요' }),
    ).not.toBeInTheDocument();
  });
});

// 화면 본문 등장(globals.css .enter-content) — 앞으로 들어오거나 스켈레톤을 거친 마운트에서 1회 떠오른다(useEntranceMotion).
// 히어로(로고 모핑 대상)는 연출 요소 밖이어야 한다 — 조상에 transform 이 걸리면 모핑이 8px 아래를 목표로 끝나 튄다.
// 재생 중인 transform 은 fixed 자손의 기준이 되므로 하단 고정 지원 바도 밖이어야 한다.
describe('동아리 상세 본문 등장', () => {
  afterEach(() => document.documentElement.removeAttribute('data-back-navigation'));

  function expectBodyAnimatedWithoutHero(container: HTMLElement) {
    expect(screen.getByRole('tablist').closest('.enter-content')).not.toBeNull();
    // jsdom 은 md:hidden 을 무시해 데스크탑·모바일 히어로 제목이 둘 다 렌더된다.
    for (const heroTitle of screen.getAllByRole('heading', { level: 1 })) {
      expect(heroTitle.closest('.enter-content')).toBeNull();
    }
    const applyBar = container.querySelector('.fixed.bottom-0');
    expect(applyBar).toHaveAttribute('data-bottom-bar');
    expect(applyBar?.closest('.enter-content')).toBeNull();
  }

  it('스켈레톤을 지연 표시하고, 도착한 본문에 enter-content 를 걸되 히어로·지원 바는 밖에 둔다', async () => {
    seed();
    const { container } = renderPage();

    const skeleton = screen.getByRole('status', { name: '동아리 정보 불러오는 중' });
    expect(skeleton.parentElement).toHaveClass('delayed-show');
    // 둘 다 animation 축약이라 같은 요소면 delayed-show 가 펄스를 지운다.
    expect(skeleton).not.toHaveClass('delayed-show');

    await screen.findAllByRole('heading', { level: 1 });
    expectBodyAnimatedWithoutHero(container);
  });

  it('시드·캐시로 첫 렌더부터 콘텐츠여도 앞으로 들어온 마운트면 본문이 떠오른다', async () => {
    seed();
    const queryClient = createQueryClient();
    queryClient.setQueryData(clubQueryKeys.detail(CLUB_ID), clubDetail);
    const { container } = renderPage(queryClient);

    await screen.findAllByRole('heading', { level: 1 });
    expectBodyAnimatedWithoutHero(container);
  });

  // 마커가 선 마운트는 시드·캐시여도 본문에 클래스를 걸지 않는다 — useEntranceMotion 의 뒤로·앞으로 가기 분기 가드.
  it('뒤로·앞으로 가기로 그려지는 마운트(마커)는 본문에 enter-content 를 걸지 않는다', async () => {
    seed();
    document.documentElement.setAttribute('data-back-navigation', '');
    const queryClient = createQueryClient();
    queryClient.setQueryData(clubQueryKeys.detail(CLUB_ID), clubDetail);
    renderPage(queryClient);

    await screen.findAllByRole('heading', { level: 1 });
    // 대표 활동 같은 하위 영역은 따로 받아와 스켈레톤을 거치면 떠오른다(useEnteredFromSkeleton) — 본문 섹션만 본다.
    expect(screen.getByRole('tablist').closest('.enter-content')).toBeNull();
  });
});
