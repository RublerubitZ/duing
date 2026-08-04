import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';

import { RecruitmentSwitcher } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/_components/RecruitmentSwitcher';

// 지원현황 헤더의 모집 전환 드롭다운(스펙 §3) — 진행 중(raw OPEN·자체 폼) / 지난 모집(raw CLOSED·자체 폼) 2그룹.
// 외부 폼 모집은 지원자 관리 자체가 없어 전환 대상이 아니고, 목록을 못 받은 상태에서는
// 제목 없는 트리거를 띄우느니 스위처를 통째로 숨긴다(fail-open — 기존 화면 기능은 그대로).

const CLUB_ID = 1;
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

type RecruitmentRowOverrides = {
  id: number;
  title?: string;
  startDate?: string;
  endDate?: string | null;
  status?: 'OPEN' | 'CLOSED';
  applicationMode?: 'SELF' | 'EXTERNAL';
  closedAt?: string | null;
};

function recruitmentRow(overrides: RecruitmentRowOverrides) {
  const status = overrides.status ?? 'OPEN';
  return {
    id: overrides.id,
    clubId: CLUB_ID,
    clubName: '두잉',
    title: overrides.title ?? `${overrides.id}기 모집`,
    startDate: overrides.startDate ?? '2026-03-02',
    endDate: overrides.endDate === undefined ? '2026-03-16' : overrides.endDate,
    capacity: 20,
    status,
    displayStatus: status,
    effectivelyOpen: status === 'OPEN',
    applicationMode: overrides.applicationMode ?? 'SELF',
    externalFormUrl: null,
    useInterview: false,
    targetRole: 'MEMBER',
    closedAt: overrides.closedAt ?? null,
  };
}

/** 진행 중 2건(자체 폼) + 마감 2건(자체 폼) + 외부 폼 2건 — 그룹·정렬·제외를 한 번에 본다. */
const MIXED_ROWS = [
  recruitmentRow({ id: 12, title: '12기 신입 모집' }),
  recruitmentRow({ id: 11, title: '상시 모집', endDate: null }),
  recruitmentRow({
    id: 7,
    title: '7기 모집',
    startDate: '2025-03-02',
    endDate: '2025-03-16',
    status: 'CLOSED',
    closedAt: '2025-03-16T09:00:00Z',
  }),
  recruitmentRow({
    id: 8,
    title: '8기 모집',
    startDate: '2025-09-01',
    endDate: '2025-09-15',
    status: 'CLOSED',
    closedAt: '2025-09-15T09:00:00Z',
  }),
  recruitmentRow({ id: 5, title: '외부 폼 진행 모집', applicationMode: 'EXTERNAL' }),
  recruitmentRow({
    id: 6,
    title: '외부 폼 마감 모집',
    status: 'CLOSED',
    applicationMode: 'EXTERNAL',
  }),
];

let requestCount = 0;

function recruitmentListHandler(recruitmentRows: unknown[]) {
  return http.get(`*/clubs/${CLUB_ID}/recruitments`, () => {
    requestCount += 1;
    return HttpResponse.json({ ok: true, message: null, data: recruitmentRows });
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  requestCount = 0;
});
afterAll(() => server.close());

const FALLBACK_TITLE = '상세로 받은 모집 제목';

function renderSwitcher(currentRecruitmentId: number) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ApiClientProvider client={apiClient}>
      <QueryClientProvider client={queryClient}>
        <RecruitmentSwitcher
          clubId={CLUB_ID}
          currentRecruitmentId={currentRecruitmentId}
          fallbackTitle={FALLBACK_TITLE}
        />
      </QueryClientProvider>
    </ApiClientProvider>,
  );
}

function openSwitcher() {
  return screen.findByRole('button', { name: /모집 전환/ });
}

describe('RecruitmentSwitcher — 그룹·정렬·제외', () => {
  it('진행 중·지난 모집 2그룹으로 나뉘고, 지난 모집은 종료 시점 내림차순으로 마감 뱃지와 함께 뜬다', async () => {
    const user = userEvent.setup();
    server.use(recruitmentListHandler(MIXED_ROWS));
    renderSwitcher(12);

    await user.click(await openSwitcher());
    const menuItems = await screen.findAllByRole('menuitem');

    expect(screen.getByText('진행 중')).toBeInTheDocument();
    expect(screen.getByText('지난 모집')).toBeInTheDocument();

    // 진행 중은 백엔드 정렬(OPEN 우선·startDate desc) 그대로, 지난 모집은 종료 시점 내림차순(8기 → 7기).
    expect(menuItems.map((menuItem) => menuItem.textContent)).toEqual([
      expect.stringContaining('12기 신입 모집'),
      expect.stringContaining('상시 모집'),
      expect.stringContaining('8기 모집'),
      expect.stringContaining('7기 모집'),
    ]);

    // '마감' 뱃지는 지난 모집에만.
    expect(within(menuItems[0]!).queryByText('마감')).not.toBeInTheDocument();
    expect(within(menuItems[1]!).queryByText('마감')).not.toBeInTheDocument();
    expect(within(menuItems[2]!).getByText('마감')).toBeInTheDocument();
    expect(within(menuItems[3]!).getByText('마감')).toBeInTheDocument();
  });

  it('외부 폼 모집은 진행 중·마감 모두 목록에 없다', async () => {
    const user = userEvent.setup();
    server.use(recruitmentListHandler(MIXED_ROWS));
    renderSwitcher(12);

    await user.click(await openSwitcher());
    await screen.findAllByRole('menuitem');

    expect(screen.queryByText('외부 폼 진행 모집')).not.toBeInTheDocument();
    expect(screen.queryByText('외부 폼 마감 모집')).not.toBeInTheDocument();
  });

  it('그룹에 항목이 없으면 그 그룹 라벨을 띄우지 않는다', async () => {
    const user = userEvent.setup();
    server.use(
      recruitmentListHandler([
        recruitmentRow({ id: 8, title: '8기 모집', status: 'CLOSED', closedAt: '2025-09-15T09:00:00Z' }),
      ]),
    );
    renderSwitcher(8);

    await user.click(await openSwitcher());
    await screen.findAllByRole('menuitem');

    expect(screen.getByText('지난 모집')).toBeInTheDocument();
    expect(screen.queryByText('진행 중')).not.toBeInTheDocument();
  });
});

describe('RecruitmentSwitcher — 현재 모집 표시·이동', () => {
  it('트리거에 현재 모집 제목이 뜨고, 목록에서 현재 모집만 선택 표시된다', async () => {
    const user = userEvent.setup();
    server.use(recruitmentListHandler(MIXED_ROWS));
    renderSwitcher(8);

    const trigger = await openSwitcher();
    expect(trigger).toHaveTextContent('8기 모집');

    await user.click(trigger);
    const menuItems = await screen.findAllByRole('menuitem');

    const currentItem = menuItems.find((menuItem) => menuItem.textContent?.includes('8기 모집'));
    expect(within(currentItem!).getByText('현재 선택됨')).toBeInTheDocument();
    expect(screen.getAllByText('현재 선택됨')).toHaveLength(1);
  });

  it('항목은 해당 모집의 지원현황으로 가는 링크다', async () => {
    const user = userEvent.setup();
    server.use(recruitmentListHandler(MIXED_ROWS));
    renderSwitcher(12);

    await user.click(await openSwitcher());
    const menuItems = await screen.findAllByRole('menuitem');

    expect(menuItems.map((menuItem) => menuItem.getAttribute('href'))).toEqual([
      `/manage/clubs/${CLUB_ID}/recruitments/12/applicants`,
      `/manage/clubs/${CLUB_ID}/recruitments/11/applicants`,
      `/manage/clubs/${CLUB_ID}/recruitments/8/applicants`,
      `/manage/clubs/${CLUB_ID}/recruitments/7/applicants`,
    ]);
  });
});

// 전환 목록에서 현재 모집을 못 찾으면 드롭다운만 걷고, 헤더에서 모집 식별이 사라지지 않도록
// 제목은 상세에서 받은 값으로 남긴다(외부 폼 모집 직접 접근이 상시 이 경로).
describe('RecruitmentSwitcher — 목록을 못 받으면 드롭다운을 걷고 제목만 남긴다', () => {
  it('모집 목록 로딩 중에는 트리거 없이 제목만 보이다가, 목록이 오면 트리거로 바뀐다', async () => {
    server.use(recruitmentListHandler(MIXED_ROWS));
    renderSwitcher(12);

    expect(screen.queryByRole('button', { name: /모집 전환/ })).not.toBeInTheDocument();
    expect(screen.getByText(FALLBACK_TITLE)).toBeInTheDocument();

    expect(await openSwitcher()).toBeInTheDocument();
    expect(screen.queryByText(FALLBACK_TITLE)).not.toBeInTheDocument();
  });

  it('모집 목록 조회가 실패해도 제목은 헤더에 남는다', async () => {
    server.use(
      http.get(`*/clubs/${CLUB_ID}/recruitments`, () => {
        requestCount += 1;
        return HttpResponse.json({ ok: false, message: 'error', data: null }, { status: 500 });
      }),
    );
    renderSwitcher(12);

    await waitFor(() => expect(requestCount).toBe(1));
    expect(screen.queryByRole('button', { name: /모집 전환/ })).not.toBeInTheDocument();
    expect(screen.getByText(FALLBACK_TITLE)).toBeInTheDocument();
  });

  it('현재 모집이 목록에 없으면(캐시 미스 등) 제목 없는 트리거 대신 제목 텍스트를 보인다', async () => {
    server.use(recruitmentListHandler([recruitmentRow({ id: 11, title: '상시 모집' })]));
    renderSwitcher(12);

    await waitFor(() => expect(requestCount).toBe(1));
    expect(screen.queryByRole('button', { name: /모집 전환/ })).not.toBeInTheDocument();
    expect(screen.getByText(FALLBACK_TITLE)).toBeInTheDocument();
  });

  it('현재 모집이 외부 폼이면 전환 대상이 아니라 드롭다운은 없지만 제목은 남는다', async () => {
    server.use(recruitmentListHandler(MIXED_ROWS));
    renderSwitcher(5);

    await waitFor(() => expect(requestCount).toBe(1));
    expect(screen.queryByRole('button', { name: /모집 전환/ })).not.toBeInTheDocument();
    expect(screen.getByText(FALLBACK_TITLE)).toBeInTheDocument();
  });
});
