import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type { ClubHeroActivity, ClubPhoto } from '@duing/types';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

import ClubPhotosPage from '@/app/manage/clubs/[clubId]/photos/page';

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function makeHero(id: number, displayOrder: number): ClubHeroActivity {
  return {
    id,
    clubPhotoId: id * 10,
    storageKey: `key/${id}.jpg`,
    caption: null,
    width: null,
    height: null,
    title: `제목${id}`,
    description: `설명${id}`,
    displayOrder,
  };
}

function makePhoto(id: number): ClubPhoto {
  return { id, storageKey: `photo/${id}.jpg`, caption: null, width: null, height: null, displayOrder: id };
}

function envelope(data: unknown) {
  return HttpResponse.json({ ok: true, message: null, data });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function seed(heroActivities: ClubHeroActivity[], photos: ClubPhoto[]) {
  server.use(
    http.get('*/leader/clubs/me/managed', () =>
      envelope([
        {
          clubId: CLUB_ID,
          clubName: '두잉',
          logoUrl: null,
          myRole: 'LEADER',
          centralClub: false,
          activeRecruitmentCount: 0,
        },
      ]),
    ),
    http.get(`*/clubs/${CLUB_ID}/photos`, () => envelope(photos)),
    http.get(`*/clubs/${CLUB_ID}/hero-activities`, () => envelope(heroActivities)),
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // React 19 use(thenable) 가 재진입 없이 값을 꺼내가도록 status/value 를 미리 태깅한다
  // (recruitment-list-page.test 선례 — 일반 Promise.resolve 는 jsdom+vitest 에서 영구 loading).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  const view = render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <ClubPhotosPage params={params} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
  return { ...view, queryClient };
}

describe('활동 피드 page 조립', () => {
  it('대표 활동 2 + 사진 3 이면 두 섹션·"등록 2/6"·Preview 첫 hero 제목·사진 추가 카드를 렌더한다', async () => {
    seed([makeHero(1, 1), makeHero(2, 2)], [makePhoto(10), makePhoto(20), makePhoto(30)]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: '활동 피드' })).toBeInTheDocument();
    // 좌측 두 섹션
    expect(screen.getByText('대표 활동 6')).toBeInTheDocument();
    expect(screen.getByText('전체 활동 사진')).toBeInTheDocument();
    // 등록 수는 hero 배열 길이(2) — displayOrder 최대(2)나 슬롯 수가 아님
    expect(screen.getByText('등록 2/6')).toBeInTheDocument();
    // 사진 추가 카드
    expect(screen.getByRole('button', { name: '사진 추가' })).toBeInTheDocument();
    // 우측 Preview — 동아리명 + 첫 hero 제목
    const preview = screen.getByTestId('activity-preview');
    expect(within(preview).getByText('두잉')).toBeInTheDocument();
    expect(within(preview).getByText('제목1')).toBeInTheDocument();
  });

  it('대표 활동 0 이면 Preview 가 빈 상태 문구를 보인다', async () => {
    seed([], [makePhoto(10)]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: '활동 피드' })).toBeInTheDocument();
    expect(screen.getByText('등록 0/6')).toBeInTheDocument();
    const preview = screen.getByTestId('activity-preview');
    expect(within(preview).getByText('대표 활동을 등록하면 여기에 보여요')).toBeInTheDocument();
  });

  it('M-5: hero 쿼리 실패 시 빈 슬롯 화면 대신 에러 상태를 보이고, 다시 시도로 복구한다', async () => {
    let heroFails = true;
    server.use(
      http.get('*/leader/clubs/me/managed', () =>
        envelope([
          {
            clubId: CLUB_ID,
            clubName: '두잉',
            logoUrl: null,
            myRole: 'LEADER',
            centralClub: false,
            activeRecruitmentCount: 0,
          },
        ]),
      ),
      http.get(`*/clubs/${CLUB_ID}/photos`, () => envelope([makePhoto(10)])),
      http.get(`*/clubs/${CLUB_ID}/hero-activities`, () =>
        heroFails ? new HttpResponse(null, { status: 500 }) : envelope([makeHero(1, 1)]),
      ),
    );
    renderPage();

    // 실패 시 섹션을 렌더하지 않고(빈 슬롯 재등록 유도 방지) 에러 + 재시도 버튼을 보인다.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('활동 피드를 불러오지 못했어요');
    expect(screen.queryByText('대표 활동 6')).not.toBeInTheDocument();

    // 다시 시도 → 두 쿼리 refetch 성공 → 정상 화면.
    heroFails = false;
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(await screen.findByText('대표 활동 6')).toBeInTheDocument();
    expect(screen.getByText('등록 1/6')).toBeInTheDocument();
  });

  it('백그라운드 refetch 실패는 이전 data 로 화면을 유지한다(에러 화면으로 언마운트 금지 — draft 보존)', async () => {
    let heroFails = false;
    server.use(
      http.get('*/leader/clubs/me/managed', () =>
        envelope([
          {
            clubId: CLUB_ID,
            clubName: '두잉',
            logoUrl: null,
            myRole: 'LEADER',
            centralClub: false,
            activeRecruitmentCount: 0,
          },
        ]),
      ),
      http.get(`*/clubs/${CLUB_ID}/photos`, () => envelope([makePhoto(10)])),
      http.get(`*/clubs/${CLUB_ID}/hero-activities`, () =>
        heroFails ? new HttpResponse(null, { status: 500 }) : envelope([makeHero(1, 1)]),
      ),
    );
    const { queryClient } = renderPage();
    expect(await screen.findByText('등록 1/6')).toBeInTheDocument();

    // 초기 로드 성공 후 refetch(invalidate 등)가 실패 — isError 지만 이전 data 는 남아 있다.
    heroFails = true;
    await queryClient.invalidateQueries();

    expect(screen.getByText('등록 1/6')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
