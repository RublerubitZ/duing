import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { NoticeCardItem, ClubEventCard, PageResponse } from '@duing/types';

import { ClubDetailNotices } from '@/app/clubs/[clubId]/_components/ClubDetailNotices';
import { ClubDetailEvents } from '@/app/clubs/[clubId]/_components/ClubDetailEvents';

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
  ...overrides,
});

const makeEvent = (id: number, overrides: Partial<ClubEventCard> = {}): ClubEventCard => ({
  id,
  title: `일정 ${id}`,
  startAt: '2026-06-10T19:00:00Z',
  endAt: '2026-06-10T21:00:00Z',
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

describe('ClubDetailNotices (멤버 공지 미리보기)', () => {
  it('최근 공지를 최대 4건까지 보여주고 전체 보기 링크를 건다', async () => {
    server.use(
      http.get(`${BASE}/clubs/7/notices`, () =>
        ok(noticePage([1, 2, 3, 4, 5, 6].map((id) => makeNotice(id)))),
      ),
    );
    renderWithProviders(<ClubDetailNotices clubId={7} />);

    expect(await screen.findByText('공지 1')).toBeInTheDocument();
    expect(screen.getByText('공지 4')).toBeInTheDocument();
    // 5번째부터는 미리보기에서 잘린다
    expect(screen.queryByText('공지 5')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: '전체 보기 →' })).toHaveAttribute(
      'href',
      '/clubs/7/member/notices',
    );
  });

  it('공지가 없으면 빈 상태를 보여준다', async () => {
    server.use(http.get(`${BASE}/clubs/7/notices`, () => ok(noticePage([]))));
    renderWithProviders(<ClubDetailNotices clubId={7} />);
    expect(await screen.findByText('등록된 공지가 없어요.')).toBeInTheDocument();
  });
});

describe('ClubDetailEvents (멤버 일정 미리보기)', () => {
  it('일정을 최대 4건까지 보여주고 전체 보기 링크를 건다', async () => {
    server.use(
      http.get(`${BASE}/clubs/7/events`, () => ok([1, 2, 3, 4, 5].map((id) => makeEvent(id)))),
    );
    renderWithProviders(<ClubDetailEvents clubId={7} />);

    expect(await screen.findByText('일정 1')).toBeInTheDocument();
    expect(screen.getByText('일정 4')).toBeInTheDocument();
    expect(screen.queryByText('일정 5')).not.toBeInTheDocument();

    expect(screen.getByRole('link', { name: '전체 보기 →' })).toHaveAttribute(
      'href',
      '/clubs/7/member/events',
    );
  });

  it('일정이 없으면 빈 상태를 보여준다', async () => {
    server.use(http.get(`${BASE}/clubs/7/events`, () => ok([])));
    renderWithProviders(<ClubDetailEvents clubId={7} />);
    expect(await screen.findByText('등록된 일정이 없어요.')).toBeInTheDocument();
  });
});
