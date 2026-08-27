import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClubDetail } from '@duing/types';
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

vi.mock('@/app/_lib/analytics', () => ({ captureEvent: vi.fn() }));

import { ClubDetailPage } from '@/app/clubs/[clubId]/_pages/ClubDetailPage';

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

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
  projects: [],
  useGeneration: false,
  activeRecruitment: null,
};

function envelope(data: unknown) {
  return HttpResponse.json({ ok: true, message: null, data });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/** 조회 기록 요청의 body 를 모아 두고, 응답 상태를 테스트마다 고를 수 있게 한다. */
function seed(options: { viewStatus?: number } = {}) {
  const recordedBodies: Array<{ visitorKey?: string }> = [];
  server.use(
    http.get(`*/clubs/${CLUB_ID}`, () => envelope(clubDetail)),
    http.get(`*/clubs/${CLUB_ID}/photos`, () => envelope([])),
    http.get(`*/clubs/${CLUB_ID}/hero-activities`, () => envelope([])),
    http.post(`*/clubs/${CLUB_ID}/views`, async ({ request }) => {
      recordedBodies.push((await request.json()) as { visitorKey?: string });
      const status = options.viewStatus ?? 204;
      return new HttpResponse(null, { status });
    }),
  );
  return recordedBodies;
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

describe('동아리 상세 조회 기록 비콘', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('상세 페이지에 들어가면 이 브라우저의 방문자 키로 조회가 기록된다', async () => {
    const recordedBodies = seed();
    renderPage();

    await waitFor(() => expect(recordedBodies.length).toBeGreaterThan(0));
    const [firstBody] = recordedBodies;
    expect(firstBody?.visitorKey).toBe(window.localStorage.getItem('duing:visitor'));
  });

  it('조회 기록이 실패해도 상세 내용은 그대로 렌더된다', async () => {
    // 429(총량 상한)·404·오프라인 모두 같은 경로 — 부수 신호라 화면을 막아선 안 된다.
    seed({ viewStatus: 429 });
    renderPage();

    expect(await screen.findAllByRole('heading', { name: '두잉' })).not.toHaveLength(0);
  });

  it('방문자 키를 만들 수 없는 환경에서는 조회를 기록하지 않고 화면만 렌더한다', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('localStorage blocked');
    });
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('crypto unavailable');
    });
    const recordedBodies = seed();

    // 키 확보 자체가 실패해도 렌더가 끊기면 안 된다.
    expect(() => renderPage()).not.toThrow();
    expect(await screen.findAllByRole('heading', { name: '두잉' })).not.toHaveLength(0);
    expect(recordedBodies).toHaveLength(0);
  });
});
