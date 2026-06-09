import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { AvailabilityItem, SlotListView } from '@duing/types';

import { ManualAssignModal } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ManualAssignModal';

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
  assignedSlotId?: number | null;
  onClose?: () => void;
};

function renderModal({
  interviewAvailabilities = [slotA, slotB],
  assignedSlotId = null,
  onClose = () => {},
}: RenderOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

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
        interviewAvailabilities={interviewAvailabilities}
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

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');

    const availabilityList = screen.getByRole('list', {
      name: '지원자가 선택한 슬롯',
    });
    const items = within(availabilityList).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent(/6\/13.*18:00.*–.*18:30/);
    expect(items[1]).toHaveTextContent(/6\/13.*18:30.*–.*19:00/);

    expect(
      screen.queryByRole('list', { name: '선택하지 않은 슬롯' }),
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
    });
    await user.click(toggle);

    await waitFor(() => expect(slotsFetchCount).toBe(1));

    const overrideList = await screen.findByRole('list', {
      name: '선택하지 않은 슬롯',
    });
    const overrideItems = within(overrideList).getAllByRole('listitem');
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

    expect(screen.getByRole('button', { name: '배정' })).toBeDisabled();
  });

  it('availability 안의 슬롯을 선택해 배정하면 confirm 없이 바로 mutation 이 호출되고 onClose 가 실행된다', async () => {
    const user = userEvent.setup();
    let assignedPayload: { applicationId: number; slotId: number } | null = null;
    server.use(
      http.put(`*/applications/:applicationId/interview-schedule`, async ({ params, request }) => {
        const body = (await request.json()) as { slotId: number };
        assignedPayload = {
          applicationId: Number(params.applicationId),
          slotId: body.slotId,
        };
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByRole('radio', { name: /6\/13.*18:00.*–.*18:30/ }));
    await user.click(screen.getByRole('button', { name: '배정' }));

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
        const body = (await request.json()) as { slotId: number };
        assignedSlotId = body.slotId;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/ }),
    );

    const overrideRadio = await screen.findByRole('radio', {
      name: /6\/15.*20:00.*–.*20:30/,
    });
    await user.click(overrideRadio);
    await user.click(screen.getByRole('button', { name: '배정' }));

    const confirmDialog = await screen.findByRole('alertdialog');
    expect(confirmDialog).toHaveTextContent('지원자가 선택하지 않은 시간입니다.');
    expect(confirmDialog).toHaveTextContent(
      '이 시간으로 배정하면 지원자가 참석하기 어려울 수 있습니다.',
    );
    expect(confirmDialog).toHaveTextContent('계속 진행하시겠습니까?');

    await user.click(within(confirmDialog).getByRole('button', { name: '계속 진행' }));

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
      screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/ }),
    );
    const overrideRadio = await screen.findByRole('radio', {
      name: /6\/15.*20:00.*–.*20:30/,
    });
    await user.click(overrideRadio);
    await user.click(screen.getByRole('button', { name: '배정' }));

    const confirmDialog = await screen.findByRole('alertdialog');
    await user.click(within(confirmDialog).getByRole('button', { name: '취소' }));

    expect(assignCalled).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

    await user.click(screen.getByRole('radio', { name: /6\/13.*18:00.*–.*18:30/ }));
    await user.click(screen.getByRole('button', { name: '배정' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('슬롯이 이미 가득 찼습니다.');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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
    });
    await user.click(toggle);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '슬롯을 불러오지 못했습니다',
    );

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: /선택하지 않은 슬롯도 보기/ })).not.toBeChecked(),
    );
  });

  it('취소 버튼을 누르면 onClose 가 호출된다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderModal({ onClose });

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
