import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, todayKstDateString } from '@duing/hooks';
import type { NoticeCardItem, ClubEventCard, PageResponse } from '@duing/types';

import { ClubDetailNews } from '@/app/clubs/[clubId]/_components/ClubDetailNews';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const BASE = 'http://localhost:8080/api/v1';
const server = setupServer();
const apiClient = createApiClient({ baseUrl: BASE });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiClientProvider client={apiClient}>{ui}</ApiClientProvider>
    </QueryClientProvider>,
  );
}

const makeNotice = (id: number, overrides: Partial<NoticeCardItem> = {}): NoticeCardItem => ({
  id,
  title: `공지 ${id}`,
  summary: '',
  coverImageUrl: '',
  linkUrl: null,
  category: 'GENERAL',
  tags: [],
  pinned: false,
  expiresAt: null,
  createdAt: '2026-06-01T10:00:00Z',
  owningClubId: null,
  clubName: null,
  ...overrides,
});

const makeEvent = (id: number, overrides: Partial<ClubEventCard> = {}): ClubEventCard => ({
  id,
  title: `일정 ${id}`,
  // KST 2026-06-10 19:00 (day=10)
  startAt: '2026-06-10T10:00:00Z',
  endAt: '2026-06-10T12:00:00Z',
  location: null,
  ...overrides,
});

const noticePage = (notices: NoticeCardItem[]): PageResponse<NoticeCardItem> => ({
  content: notices,
  page: 0,
  size: 20,
  totalElements: notices.length,
  totalPages: 1,
  hasNext: false,
});

const ok = (data: unknown) => HttpResponse.json({ ok: true, data, message: null });

// ClubDetailNews 는 공지·일정 두 훅을 동시에 마운트하므로 양쪽 엔드포인트를 함께 등록한다.
function serveClubNews(
  clubId: number,
  payload: { notices: NoticeCardItem[]; events: ClubEventCard[] },
): void {
  server.use(
    http.get(`${BASE}/clubs/${clubId}/notices`, () => ok(noticePage(payload.notices))),
    http.get(`${BASE}/clubs/${clubId}/events`, () => ok(payload.events)),
  );
}

function sectionByHeading(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const section = heading.closest('section');
  if (!(section instanceof HTMLElement)) throw new Error(`section not found: ${name}`);
  return section;
}

describe('ClubDetailNews (소식 탭 — 공지+일정 통합)', () => {
  it('최근 공지·다가오는 일정 두 섹션 헤딩과 각 빈 상태를 함께 렌더한다', async () => {
    serveClubNews(7, { notices: [], events: [] });
    renderWithProviders(<ClubDetailNews clubId={7} />);

    expect(screen.getByRole('heading', { name: '최근 공지' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '다가오는 일정' })).toBeInTheDocument();
    expect(await screen.findByText('등록된 공지가 없어요.')).toBeInTheDocument();
    expect(await screen.findByText('등록된 일정이 없어요.')).toBeInTheDocument();
  });

  it('최근 공지를 최대 4건·카테고리 배지와 함께 보여주고 전체 보기 링크를 건다', async () => {
    serveClubNews(7, {
      notices: [1, 2, 3, 4, 5, 6].map((id) => makeNotice(id)),
      events: [],
    });
    renderWithProviders(<ClubDetailNews clubId={7} />);

    const noticesSection = sectionByHeading('최근 공지');
    expect(await within(noticesSection).findByText('공지 1')).toBeInTheDocument();
    expect(within(noticesSection).getByText('공지 4')).toBeInTheDocument();
    // 5번째부터는 미리보기에서 잘린다
    expect(within(noticesSection).queryByText('공지 5')).not.toBeInTheDocument();
    // 카테고리 pill 배지(일반)
    expect(within(noticesSection).getAllByText('일반').length).toBeGreaterThan(0);
    // 작성일 표기(KST)
    expect(within(noticesSection).getAllByText('2026.06.01').length).toBeGreaterThan(0);

    expect(
      within(noticesSection).getByRole('link', { name: '전체 보기 →' }),
    ).toHaveAttribute('href', '/clubs/7/member/notices');
    // 상세 링크
    const firstNotice = within(noticesSection).getByText('공지 1').closest('a');
    expect(firstNotice).toHaveAttribute('href', '/clubs/7/member/notices/1');
  });

  it('다가오는 일정을 최대 4건·날짜 칸(일 숫자)·시간과 함께 보여주고 전체 보기 링크를 건다', async () => {
    serveClubNews(7, {
      notices: [],
      events: [1, 2, 3, 4, 5].map((id) => makeEvent(id)),
    });
    renderWithProviders(<ClubDetailNews clubId={7} />);

    const eventsSection = sectionByHeading('다가오는 일정');
    expect(await within(eventsSection).findByText('일정 1')).toBeInTheDocument();
    expect(within(eventsSection).getByText('일정 4')).toBeInTheDocument();
    expect(within(eventsSection).queryByText('일정 5')).not.toBeInTheDocument();
    // 날짜 칸 월·일 숫자
    expect(within(eventsSection).getAllByText('6월').length).toBeGreaterThan(0);
    expect(within(eventsSection).getAllByText('10').length).toBeGreaterThan(0);
    // 시간 표기(KST 19:00)
    expect(within(eventsSection).getAllByText('19:00').length).toBeGreaterThan(0);

    expect(
      within(eventsSection).getByRole('link', { name: '전체 보기 →' }),
    ).toHaveAttribute('href', '/clubs/7/member/events');
    const firstEvent = within(eventsSection).getByText('일정 1').closest('a');
    expect(firstEvent).toHaveAttribute('href', '/clubs/7/member/events/1');
  });

  it('일정에 장소가 있으면 시간과 함께 노출한다', async () => {
    serveClubNews(7, {
      notices: [],
      events: [makeEvent(1, { location: '학생회관 201호' })],
    });
    renderWithProviders(<ClubDetailNews clubId={7} />);

    const eventsSection = sectionByHeading('다가오는 일정');
    expect(await within(eventsSection).findByText('일정 1')).toBeInTheDocument();
    expect(within(eventsSection).getByText(/학생회관 201호/)).toBeInTheDocument();
  });

  it('일정 조회에 오늘(KST) 기준 from 파라미터를 넘겨 지난 일정을 배제한다', async () => {
    let capturedFrom: string | null = null;
    server.use(
      http.get(`${BASE}/clubs/7/notices`, () => ok(noticePage([]))),
      http.get(`${BASE}/clubs/7/events`, ({ request }) => {
        capturedFrom = new URL(request.url).searchParams.get('from');
        return ok([]);
      }),
    );
    renderWithProviders(<ClubDetailNews clubId={7} />);

    // 일정 섹션 빈 상태가 뜨면 요청이 완료된 것
    expect(await screen.findByText('등록된 일정이 없어요.')).toBeInTheDocument();
    expect(capturedFrom).toBe(todayKstDateString(new Date()));
  });
});
