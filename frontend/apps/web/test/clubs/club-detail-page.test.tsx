import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ClubDetail, ClubHeroActivity } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/clubs/1',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

import ClubDetailPage from '@/app/clubs/[clubId]/page';

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
  tagline: null,
  highlights: [],
  projects: [{ icon: 'CODE', title: '해커톤', subtitle: '2박 3일 개발' }],
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

function seed(options: { heroFails?: boolean } = {}) {
  server.use(
    http.get(`*/clubs/${CLUB_ID}`, () => envelope(clubDetail)),
    http.get(`*/clubs/${CLUB_ID}/photos`, () => envelope([])),
    http.get(`*/clubs/${CLUB_ID}/hero-activities`, () =>
      options.heroFails
        ? new HttpResponse(null, { status: 500 })
        : envelope([makeHero(1, 1), makeHero(2, 2)]),
    ),
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 use(thenable) 가 재진입 없이 값을 꺼내가도록 status/value 를 미리 태깅한다
  // (activity-feed-page.test 선례 — 일반 Promise.resolve 는 jsdom+vitest 에서 영구 loading).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <ClubDetailPage params={params} />
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
