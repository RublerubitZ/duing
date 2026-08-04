import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, clubQueryKeys } from '@duing/hooks';
import type { RecruitmentSummary } from '@duing/types';

// 새 모집 등록은 마감일이 지난 채 OPEN 으로 남은 기존 모집을 백엔드가 자동 마감한 뒤 진행된다.
// 마감되면 그 모집의 지원현황이 조회 전용으로 굳으므로(아카이브 스펙 §9), 되돌릴 수 없는 전환을
// 예고 없이 실행하지 않는지 — 확인 다이얼로그의 문구·버튼과 제출 여부를 고정한다.

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('posthog-js', () => ({ default: { capture: vi.fn() } }));

import NewRecruitmentPage from '@/app/manage/clubs/[clubId]/recruitments/new/page';

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

function recruitmentSummary(overrides: Partial<RecruitmentSummary>): RecruitmentSummary {
  return {
    id: 7,
    clubId: CLUB_ID,
    clubName: '두잉',
    title: '9기 신입 모집',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    capacity: 10,
    status: 'CLOSED',
    displayStatus: 'CLOSED',
    closedAt: null,
    effectivelyOpen: false,
    applicationMode: 'SELF',
    externalFormUrl: null,
    useInterview: false,
    targetRole: 'MEMBER',
    ...overrides,
  };
}

/** 마감일이 지났는데 status 가 OPEN 인 모집 — 백엔드 create 가 자동 마감하는 유일한 모양. */
const expiredOpenRecruitment = recruitmentSummary({ status: 'OPEN', displayStatus: 'CLOSED' });
/** 이미 마감된 지난 모집 — 이번 등록이 건드리지 않는다. */
const alreadyClosedRecruitment = recruitmentSummary({ status: 'CLOSED', displayStatus: 'CLOSED' });

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * 모집 목록을 캐시에 미리 넣고 staleTime 을 무한으로 둬, 판정에 쓰이는 데이터가 첫 렌더부터
 * 확정돼 있게 한다 — 목록이 아직 안 온 상태와 "마감 대상 없음" 은 둘 다 다이얼로그가 안 뜨므로
 * 네트워크 타이밍에 기대면 fail-open 때문에 테스트가 이유 없이 통과한다.
 * seededRecruitments 가 undefined 면 캐시가 비어 판정 불가 상태(fail-open)를 재현한다.
 */
function renderPage(seededRecruitments?: RecruitmentSummary[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  if (seededRecruitments !== undefined) {
    queryClient.setQueryData(clubQueryKeys.recruitments(CLUB_ID), seededRecruitments);
  }
  // React 19 의 use(thenable) 가 재진입 없이 값을 꺼내가도록 status/value 를 미리 태깅한다
  // (다른 모집 페이지 테스트와 동일 패턴).
  const paramsValue = { clubId: String(CLUB_ID) };
  const params = Object.assign(Promise.resolve(paramsValue), {
    status: 'fulfilled' as const,
    value: paramsValue,
  });
  const searchParamsValue: { cloneFrom?: string } = {};
  const searchParams = Object.assign(Promise.resolve(searchParamsValue), {
    status: 'fulfilled' as const,
    value: searchParamsValue,
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <NewRecruitmentPage params={params} searchParams={searchParams} />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

/** 로컬 타임존 기준 오늘±N일(YYYY-MM-DD) — 고정 날짜는 생성 스키마의 "종료일은 오늘 이후" 규칙에 만료된다. */
function localIsoDate(daysFromToday: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 자체 폼 create 모드의 필수 입력을 모두 채운다. */
function fillCreateForm() {
  fireEvent.change(screen.getByPlaceholderText('모집 공고 제목을 입력하세요'), {
    target: { value: '10기 신입 모집' },
  });
  fireEvent.change(screen.getByLabelText(/^시작일/), { target: { value: localIsoDate(1) } });
  fireEvent.change(screen.getByLabelText(/^종료일/), { target: { value: localIsoDate(30) } });
  fireEvent.click(screen.getByRole('button', { name: '+ 질문 추가' }));
  fireEvent.change(screen.getByPlaceholderText('질문 1을 입력하세요'), {
    target: { value: '지원 동기를 알려주세요' },
  });
}

function submitForm() {
  fireEvent.click(screen.getAllByRole('button', { name: /모집 시작/ })[0]!);
}

/** 등록 POST 를 가로채 호출 횟수를 세는 핸들러를 등록한다. */
function trackCreateRequests() {
  const createdPayloads: unknown[] = [];
  server.use(
    http.post(`*/leader/clubs/${CLUB_ID}/recruitments`, async ({ request }) => {
      createdPayloads.push(await request.json());
      return HttpResponse.json({ ok: true, message: null, data: 101 });
    }),
  );
  return createdPayloads;
}

describe('NewRecruitmentPage — 기존 모집 마감 확인', () => {
  it('마감될 기존 OPEN 모집이 있으면 제출 직전에 확인 다이얼로그를 띄운다', async () => {
    trackCreateRequests();
    renderPage([expiredOpenRecruitment]);

    fillCreateForm();
    submitForm();

    expect(await screen.findByText('기존 모집을 마감하시겠습니까?')).toBeInTheDocument();
    expect(
      screen.getByText("새 모집을 등록하면 현재 진행 중인 모집 '9기 신입 모집' 이 마감 처리됩니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /마감된 모집은 지원현황이 조회 전용으로 전환되며, 지원 상태 변경, 평가, 면접 라운드 생성이\s+불가능합니다\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('계속하시겠습니까?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등록 및 마감' })).toBeInTheDocument();
  });

  it('취소하면 등록하지 않고 다이얼로그만 닫는다', async () => {
    const createdPayloads = trackCreateRequests();
    renderPage([expiredOpenRecruitment]);

    fillCreateForm();
    submitForm();
    fireEvent.click(await screen.findByRole('button', { name: '취소' }));

    await vi.waitFor(() =>
      expect(screen.queryByText('기존 모집을 마감하시겠습니까?')).not.toBeInTheDocument(),
    );
    expect(createdPayloads).toHaveLength(0);
  });

  it('등록 및 마감을 누르면 그때 한 번만 등록한다', async () => {
    const createdPayloads = trackCreateRequests();
    renderPage([expiredOpenRecruitment]);

    fillCreateForm();
    submitForm();
    fireEvent.click(await screen.findByRole('button', { name: '등록 및 마감' }));

    await vi.waitFor(() => expect(createdPayloads).toHaveLength(1));
    expect(createdPayloads[0]).toMatchObject({ title: '10기 신입 모집' });
  });

  it('마감될 OPEN 모집이 없으면 다이얼로그 없이 바로 등록한다', async () => {
    const createdPayloads = trackCreateRequests();
    renderPage([alreadyClosedRecruitment]);

    fillCreateForm();
    submitForm();

    await vi.waitFor(() => expect(createdPayloads).toHaveLength(1));
    expect(screen.queryByText('기존 모집을 마감하시겠습니까?')).not.toBeInTheDocument();
  });

  it('모집 목록을 못 받아 판정할 수 없으면 확인 없이 그대로 등록한다(fail-open)', async () => {
    const createdPayloads = trackCreateRequests();
    // 목록 조회는 실패시켜 캐시가 비어 있는 상태(판정 불가)를 만든다.
    server.use(
      http.get(`*/clubs/${CLUB_ID}/recruitments`, () => HttpResponse.json({}, { status: 500 })),
    );
    renderPage();

    fillCreateForm();
    submitForm();

    await vi.waitFor(() => expect(createdPayloads).toHaveLength(1));
    expect(screen.queryByText('기존 모집을 마감하시겠습니까?')).not.toBeInTheDocument();
  });
});
