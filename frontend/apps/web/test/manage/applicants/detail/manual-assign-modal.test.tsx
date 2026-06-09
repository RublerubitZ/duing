import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';

import { createApiClient } from '@duing/api';
import { ApiClientProvider, interviewQueryKeys } from '@duing/hooks';

import { ManualAssignModal } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ManualAssignModal';

import type { ReactNode } from 'react';
import type { AvailabilityItem, SlotListView } from '@duing/types';

const assignBodySchema = z.object({ slotId: z.number() });

const RECRUITMENT_ID = 99;
const APPLICATION_ID = 501;

const slotA: AvailabilityItem = {
  slotId: 1,
  startTime: '2026-06-13T18:00:00',
  endTime: '2026-06-13T18:30:00',
};
const slotB: AvailabilityItem = {
  slotId: 2,
  startTime: '2026-06-13T18:30:00',
  endTime: '2026-06-13T19:00:00',
};
const slotC: SlotListView = {
  slotId: 3,
  startTime: '2026-06-15T20:00:00',
  endTime: '2026-06-15T20:30:00',
  capacity: 4,
  availabilityCount: 0,
  assignedCount: 0,
};

const slotsResponse: SlotListView[] = [
  {
    slotId: slotA.slotId,
    startTime: slotA.startTime,
    endTime: slotA.endTime,
    capacity: 4,
    availabilityCount: 2,
    assignedCount: 1,
  },
  {
    slotId: slotB.slotId,
    startTime: slotB.startTime,
    endTime: slotB.endTime,
    capacity: 4,
    availabilityCount: 1,
    assignedCount: 0,
  },
  slotC,
];

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

type RenderOptions = {
  interviewAvailabilities?: AvailabilityItem[];
  assignedSlot?: AvailabilityItem | null;
  assignedSlotId?: number | null;
  applicantName?: string;
  onClose?: () => void;
  queryClient?: QueryClient;
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

function renderModal({
  interviewAvailabilities = [slotA, slotB],
  assignedSlot = null,
  assignedSlotId = null,
  applicantName = '홍길동',
  onClose = () => {},
  queryClient = createTestQueryClient(),
}: RenderOptions = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </ApiClientProvider>
    );
  }

  return render(
    <Wrapper>
      <ManualAssignModal
        applicationId={APPLICATION_ID}
        recruitmentId={RECRUITMENT_ID}
        applicantName={applicantName}
        interviewAvailabilities={interviewAvailabilities}
        assignedSlot={assignedSlot}
        assignedSlotId={assignedSlotId}
        onClose={onClose}
      />
    </Wrapper>,
  );
}

describe('ManualAssignModal', () => {
  it('초기 렌더 시 토글 OFF 상태로 interviewAvailabilities 만 노출되고 slots fetch 가 발생하지 않는다', async () => {
    let slotsFetchCount = 0;
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () => {
        slotsFetchCount += 1;
        return HttpResponse.json({ ok: true, data: slotsResponse, message: null });
      }),
    );

    renderModal();

    const dialog = await screen.findByRole('dialog', { hidden: true });
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const availabilityList = screen.getByRole('list', {
      name: '지원자가 선택한 슬롯',
      hidden: true,
    });
    const items = within(availabilityList).getAllByRole('listitem', { hidden: true });
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/6\/13.*18:00.*–.*18:30/);
    expect(items[1]).toHaveTextContent(/6\/13.*18:30.*–.*19:00/);

    expect(
      screen.queryByRole('list', { name: '선택하지 않은 슬롯', hidden: true }),
    ).not.toBeInTheDocument();

    // 잠시 대기해도 fetch 가 발생하지 않아야 한다.
    await Promise.resolve();
    expect(slotsFetchCount).toBe(0);
  });

  it('토글 ON 시 slots 를 lazy fetch 하고 availability 밖 슬롯이 경고와 함께 노출된다', async () => {
    const user = userEvent.setup();
    let slotsFetchCount = 0;
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () => {
        slotsFetchCount += 1;
        return HttpResponse.json({ ok: true, data: slotsResponse, message: null });
      }),
    );

    renderModal();

    expect(slotsFetchCount).toBe(0);

    const toggle = screen.getByRole('switch', {
      name: /선택하지 않은 슬롯도 보기/,
      hidden: true,
    });
    await user.click(toggle);

    await waitFor(() => expect(slotsFetchCount).toBe(1));

    const overrideList = await screen.findByRole('list', {
      name: '선택하지 않은 슬롯',
      hidden: true,
    });
    const overrideItems = within(overrideList).getAllByRole('listitem', { hidden: true });
    expect(overrideItems).toHaveLength(1);
    expect(overrideItems[0]).toHaveTextContent(/6\/15.*20:00.*–.*20:30/);
    expect(overrideItems[0]).toHaveTextContent(
      '지원자가 선택하지 않은 시간입니다',
    );
  });

  it('availability 가 비어 있고 토글 OFF 일 때 empty state 안내가 노출되고 배정 버튼이 비활성화된다', () => {
    renderModal({ interviewAvailabilities: [] });

    expect(
      screen.getByText('지원자가 면접 가능 시간을 제출하지 않았습니다.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('제출 마감 전이라면 제출을 요청하세요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '긴급한 경우 아래 토글을 통해 운영진이 직접 배정할 수 있습니다.',
      ),
    ).toBeInTheDocument();

    expect(screen.getByRole('button', { name: '배정', hidden: true })).toBeDisabled();
  });

  it('availability 안의 슬롯을 선택해 배정하면 confirm 없이 바로 mutation 이 호출되고 onClose 가 실행된다', async () => {
    const user = userEvent.setup();
    let assignedPayload: { applicationId: number; slotId: number } | null = null;
    server.use(
      http.put(`*/applications/:applicationId/interview-schedule`, async ({ params, request }) => {
        const body = assignBodySchema.parse(await request.json());
        assignedPayload = {
          applicationId: Number(params.applicationId),
          slotId: body.slotId,
        };
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByRole('radio', { name: /6\/13.*18:00.*–.*18:30/, hidden: true }));
    await user.click(screen.getByRole('button', { name: '배정', hidden: true }));

    await waitFor(() => {
      expect(assignedPayload).toEqual({
        applicationId: APPLICATION_ID,
        slotId: slotA.slotId,
      });
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    expect(
      screen.queryByText('지원자가 선택하지 않은 시간입니다.'),
    ).not.toBeInTheDocument();
  });

  it('Override 슬롯을 배정하면 confirm dialog 가 노출되고, 확인 시 mutation 이 호출된다', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () =>
        HttpResponse.json({ ok: true, data: slotsResponse, message: null }),
      ),
    );
    let assignedSlotId: number | null = null;
    server.use(
      http.put(`*/applications/:applicationId/interview-schedule`, async ({ request }) => {
        const body = assignBodySchema.parse(await request.json());
        assignedSlotId = body.slotId;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
    );

    const overrideRadio = await screen.findByRole('radio', {
      name: /6\/15.*20:00.*–.*20:30/,
      hidden: true,
    });
    await user.click(overrideRadio);
    await user.click(screen.getByRole('button', { name: '배정', hidden: true }));

    const confirmDialog = await screen.findByRole('alertdialog', { hidden: true });
    expect(confirmDialog).toHaveTextContent('지원자가 선택하지 않은 시간입니다.');
    expect(confirmDialog).toHaveTextContent(
      '이 시간으로 배정하면 지원자가 참석하기 어려울 수 있습니다.',
    );
    expect(confirmDialog).toHaveTextContent('계속 진행하시겠습니까?');

    await user.click(within(confirmDialog).getByRole('button', { name: '계속 진행', hidden: true }));

    await waitFor(() => expect(assignedSlotId).toBe(slotC.slotId));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('Override confirm 거부 시 mutation 이 호출되지 않고 모달은 유지된다', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () =>
        HttpResponse.json({ ok: true, data: slotsResponse, message: null }),
      ),
    );
    let assignCalled = false;
    server.use(
      http.put(`*/applications/:applicationId/interview-schedule`, () => {
        assignCalled = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
    );
    const overrideRadio = await screen.findByRole('radio', {
      name: /6\/15.*20:00.*–.*20:30/,
      hidden: true,
    });
    await user.click(overrideRadio);
    await user.click(screen.getByRole('button', { name: '배정', hidden: true }));

    const confirmDialog = await screen.findByRole('alertdialog', { hidden: true });
    await user.click(within(confirmDialog).getByRole('button', { name: '취소', hidden: true }));

    expect(assignCalled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog', { hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });

  it('mutation 에러 (409) 시 모달 내 alert 가 노출되고 모달은 유지된다', async () => {
    const user = userEvent.setup();
    server.use(
      http.put(`*/applications/:applicationId/interview-schedule`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '슬롯이 이미 가득 찼습니다.' },
          { status: 409 },
        ),
      ),
    );

    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByRole('radio', { name: /6\/13.*18:00.*–.*18:30/, hidden: true }));
    await user.click(screen.getByRole('button', { name: '배정', hidden: true }));

    const alert = await screen.findByRole('alert', { hidden: true });
    expect(alert).toHaveTextContent('슬롯이 이미 가득 찼습니다.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });

  it('토글 ON 시 slots fetch 실패하면 inline error + 토글 자동 OFF 로 복귀한다', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '슬롯 조회 실패' },
          { status: 500 },
        ),
      ),
    );

    renderModal();

    const toggle = screen.getByRole('switch', {
      name: /선택하지 않은 슬롯도 보기/,
      hidden: true,
    });
    await user.click(toggle);

    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent(
      '슬롯을 불러오지 못했습니다',
    );

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true })).not.toBeChecked(),
    );
  });

  it('slots fetch 실패로 자동 OFF 된 뒤 다시 토글 ON 하면 retry 가 트리거되고 즉시 OFF 되지 않는다', async () => {
    const user = userEvent.setup();
    let slotsFetchCount = 0;
    let shouldFail = true;
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () => {
        slotsFetchCount += 1;
        if (shouldFail) {
          return HttpResponse.json(
            { ok: false, data: null, message: '슬롯 조회 실패' },
            { status: 500 },
          );
        }
        return HttpResponse.json({ ok: true, data: slotsResponse, message: null });
      }),
    );

    renderModal();

    const toggle = screen.getByRole('switch', {
      name: /선택하지 않은 슬롯도 보기/,
      hidden: true,
    });

    // 1차 토글 ON → fetch 실패 → 자동 OFF.
    await user.click(toggle);
    await waitFor(() => expect(slotsFetchCount).toBeGreaterThanOrEqual(1));
    expect(await screen.findByRole('alert', { hidden: true })).toHaveTextContent(
      '슬롯을 불러오지 못했습니다',
    );
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
      ).not.toBeChecked(),
    );
    const fetchCountAfterFailure = slotsFetchCount;

    // 서버 복구 후 재토글 ON — resetQueries 가 isError 캐시를 비웠으므로
    // 토글 ON 직후 즉시 OFF 되어 사용자가 인지하지 못한 채 닫혀버리는 false-negative 가 없어야 한다.
    shouldFail = false;
    await user.click(toggle);

    // 재토글 후 inline error 가 사라지고, override 후보 리스트가 정상 렌더링된다.
    await waitFor(() =>
      expect(screen.queryByText('슬롯을 불러오지 못했습니다.')).not.toBeInTheDocument(),
    );
    const overrideList = await screen.findByRole('list', {
      name: '선택하지 않은 슬롯',
      hidden: true,
    });
    expect(within(overrideList).getAllByRole('listitem', { hidden: true })).toHaveLength(1);

    // 토글이 ON 상태로 유지된다 — 자동 OFF false-negative 가 없어야 한다.
    expect(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
    ).toBeChecked();

    // 추가 fetch 가 발생했음을 확인 (resetQueries 후 retry 가 정상 트리거됨).
    expect(slotsFetchCount).toBeGreaterThan(fetchCountAfterFailure);
  });

  it('backdrop 와 dialog 에 aria-hidden 이 설정되어 있지 않다 (AT 노출 보장)', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).not.toHaveAttribute('aria-hidden');

    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    expect(backdrop).not.toHaveAttribute('aria-hidden');
  });

  it('취소 버튼을 누르면 onClose 가 호출된다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByRole('button', { name: '닫기', hidden: true }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('헤더에 지원자 이름과 현재 배정 상태가 노출된다', () => {
    renderModal({
      applicantName: '김두잉',
      assignedSlot: slotA,
      assignedSlotId: slotA.slotId,
    });

    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).toHaveTextContent('지원자: 김두잉');
    expect(dialog).toHaveTextContent(/현재 배정:.*6\/13.*18:00.*–.*18:30/);
  });

  it('assignedSlot 이 없으면 현재 배정에 "미배정" 이 표시된다', () => {
    renderModal({ applicantName: '김두잉', assignedSlot: null });

    expect(screen.getByRole('dialog', { hidden: true })).toHaveTextContent('현재 배정: 미배정');
  });

  it('ESC 키 입력 시 onClose 가 호출되고, override confirm 이 열려있으면 confirm 만 닫힌다', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () =>
        HttpResponse.json({ ok: true, data: slotsResponse, message: null }),
      ),
    );

    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
    );
    const overrideRadio = await screen.findByRole('radio', {
      name: /6\/15.*20:00.*–.*20:30/,
      hidden: true,
    });
    await user.click(overrideRadio);
    await user.click(screen.getByRole('button', { name: '배정', hidden: true }));

    expect(await screen.findByRole('alertdialog', { hidden: true })).toBeInTheDocument();

    // 첫 ESC — confirm 만 닫힌다.
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { hidden: true })).not.toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();

    // 두 번째 ESC — 모달이 닫힌다.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Backdrop 클릭 시 onClose 가 호출되고, dialog 내부 클릭은 닫지 않는다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    // dialog 내부 클릭(취소 버튼 영역 외 헤더 텍스트) → 닫히면 안 된다.
    await user.click(screen.getByText('지원자가 선택한 슬롯 (2)'));
    expect(onClose).not.toHaveBeenCalled();

    // backdrop 클릭 → 닫힌다.
    const dialog = screen.getByRole('dialog', { hidden: true });
    const backdrop = dialog.parentElement;
    expect(backdrop).not.toBeNull();
    if (backdrop) {
      await user.click(backdrop);
    }
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('assignedSlotId 가 availability 밖(이전 override 배정) 이면 selectedSlotId 가 null 로 시작하고 배정 버튼은 비활성화된다', async () => {
    const user = userEvent.setup();
    let assignCalled = false;
    server.use(
      http.put(`*/applications/:applicationId/interview-schedule`, () => {
        assignCalled = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    // assignedSlotId = slotC (availability 밖 slot 3) — 이전 운영진의 override 배정 케이스.
    renderModal({
      interviewAvailabilities: [slotA, slotB],
      assignedSlot: null,
      assignedSlotId: slotC.slotId,
    });

    // 배정 버튼 비활성화 — hidden override slot 으로 pre-select 되지 않아야 한다.
    expect(screen.getByRole('button', { name: '배정', hidden: true })).toBeDisabled();

    // availability 내 라디오들이 어느 것도 checked 가 아니어야 한다.
    const availabilityList = screen.getByRole('list', {
      name: '지원자가 선택한 슬롯',
      hidden: true,
    });
    const radios = within(availabilityList).getAllByRole('radio', { hidden: true });
    radios.forEach((radio) => expect(radio).not.toBeChecked());

    // 배정 버튼을 강제로 눌러도 mutation 도, override confirm 도 발생하지 않는다.
    await user.click(screen.getByRole('button', { name: '배정', hidden: true }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { hidden: true })).not.toBeInTheDocument(),
    );
    expect(assignCalled).toBe(false);
  });

  it('다른 화면에서 같은 query key 가 isError 캐시된 상태로 모달이 열려도, 토글 ON 시 reset → fresh fetch 가 시작되고 즉시 OFF 되지 않는다', async () => {
    const user = userEvent.setup();
    let slotsFetchCount = 0;
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () => {
        slotsFetchCount += 1;
        return HttpResponse.json({ ok: true, data: slotsResponse, message: null });
      }),
    );

    // 다른 화면에서 발생한 stale error 를 흉내 — 같은 query key 에 error state 를 미리 심어둔다.
    const queryClient = createTestQueryClient();
    const cache = queryClient.getQueryCache();
    const staleQuery = cache.build(queryClient, {
      queryKey: interviewQueryKeys.slots(RECRUITMENT_ID),
      queryFn: () => Promise.resolve([] as SlotListView[]),
    });
    staleQuery.setState({
      ...staleQuery.state,
      status: 'error',
      error: new Error('stale error from another screen'),
      errorUpdatedAt: Date.now(),
      fetchStatus: 'idle',
    });

    renderModal({ queryClient });

    const toggle = screen.getByRole('switch', {
      name: /선택하지 않은 슬롯도 보기/,
      hidden: true,
    });

    // 토글 ON — handleShowAllOn 이 resetQueries 를 먼저 호출해 stale error 를 비우므로
    // 자동 OFF useEffect 가 발동하지 않고 fresh fetch 가 정상 시작되어야 한다.
    await user.click(toggle);

    await waitFor(() => expect(slotsFetchCount).toBeGreaterThanOrEqual(1));

    // 토글이 ON 상태로 유지된다 (stale error 로 인한 false-negative OFF 가 발생하지 않음).
    expect(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
    ).toBeChecked();

    // override 후보 리스트가 정상 렌더링된다.
    const overrideList = await screen.findByRole('list', {
      name: '선택하지 않은 슬롯',
      hidden: true,
    });
    expect(within(overrideList).getAllByRole('listitem', { hidden: true })).toHaveLength(1);
  });

  it('토글 OFF 시 availability 밖 슬롯 선택이 초기화되어 후속 배정에서 override 가 발생하지 않는다', async () => {
    const user = userEvent.setup();
    let slotsFetchCount = 0;
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-slots`, () => {
        slotsFetchCount += 1;
        return HttpResponse.json({ ok: true, data: slotsResponse, message: null });
      }),
    );
    let assignCalled = false;
    server.use(
      http.put(`*/applications/:applicationId/interview-schedule`, () => {
        assignCalled = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderModal();

    // 토글 ON → override 슬롯 선택.
    await user.click(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
    );
    const overrideRadio = await screen.findByRole('radio', {
      name: /6\/15.*20:00.*–.*20:30/,
      hidden: true,
    });
    await user.click(overrideRadio);
    expect(overrideRadio).toBeChecked();

    // 토글 OFF — override 슬롯이 더 이상 selectedSlotId 가 아니어야 한다.
    await user.click(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/, hidden: true }),
    );

    await waitFor(() =>
      expect(
        screen.queryByRole('list', { name: '선택하지 않은 슬롯', hidden: true }),
      ).not.toBeInTheDocument(),
    );

    // 배정 버튼 클릭 시 selectedSlotId 가 null 이므로 confirm 도, mutation 도 발생하지 않는다.
    await user.click(screen.getByRole('button', { name: '배정', hidden: true }));

    // 충분히 기다려도 alertdialog / mutation 모두 발생하지 않아야 한다.
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog', { hidden: true })).not.toBeInTheDocument();
    });
    expect(assignCalled).toBe(false);
    expect(slotsFetchCount).toBeGreaterThanOrEqual(1);
  });
});
