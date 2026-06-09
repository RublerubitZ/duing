import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { ApplicantInterviewSlot } from '@duing/types';
import { EditAvailabilityModal } from '@/app/me/applications/[applicationId]/_components/EditAvailabilityModal';

const APPLICATION_ID = 501;
const RECRUITMENT_ID = 42;

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SLOTS: ApplicantInterviewSlot[] = [
  {
    slotId: 1,
    startTime: '2026-06-20T10:00:00',
    endTime: '2026-06-20T10:30:00',
    capacity: 2,
  },
  {
    slotId: 2,
    startTime: '2026-06-20T11:00:00',
    endTime: '2026-06-20T11:30:00',
    capacity: 2,
  },
  {
    slotId: 3,
    startTime: '2026-06-21T10:00:00',
    endTime: '2026-06-21T10:30:00',
    capacity: 2,
  },
];

function mockApplicantSlots(slots: ApplicantInterviewSlot[] = SLOTS) {
  server.use(
    http.get(
      `*/recruitments/${RECRUITMENT_ID}/applicant-interview-slots`,
      () => HttpResponse.json({ ok: true, data: slots, message: null }),
    ),
  );
}

function mockAvailabilities(slotIds: number[]) {
  server.use(
    http.get(
      `*/applications/${APPLICATION_ID}/interview-availabilities`,
      () =>
        HttpResponse.json({ ok: true, data: { slotIds }, message: null }),
    ),
  );
}

type RenderOpts = {
  isOpen?: boolean;
  onClose?: () => void;
};

function renderModal({
  isOpen = true,
  onClose = () => undefined,
}: RenderOpts = {}) {
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
      <EditAvailabilityModal
        isOpen={isOpen}
        onClose={onClose}
        applicationId={APPLICATION_ID}
        recruitmentId={RECRUITMENT_ID}
      />
    </Wrapper>,
  );
}

// 본 모달은 backdrop 가 `aria-hidden="true"` 라 내부 dialog 도 a11y tree 에서 hidden 으로
// 간주된다. testing-library 의 *ByRole 쿼리는 기본적으로 hidden 요소를 무시하므로
// `{ hidden: true }` 옵션을 명시한다. 동일 패턴이 PR-FE3 AssignToSlotModal 에 적용되어 있다.
describe('EditAvailabilityModal', () => {
  it('isOpen=false 면 dialog 가 렌더되지 않는다', () => {
    mockApplicantSlots();
    mockAvailabilities([]);
    renderModal({ isOpen: false });
    expect(
      screen.queryByRole('dialog', { hidden: true }),
    ).not.toBeInTheDocument();
  });

  it('진입 시 availabilities 의 slotIds 가 active 로 복원된다', async () => {
    mockApplicantSlots();
    mockAvailabilities([1, 3]);

    renderModal();

    // 슬롯 chip 이 그려지기까지 대기 — 첫 chip 의 시간 라벨 등장으로 확인.
    await screen.findAllByRole('button', {
      name: /10:00 ~ 10:30/,
      hidden: true,
    });

    const allButtons = screen.getAllByRole('button', { hidden: true });
    const pressedChips = allButtons.filter(
      (node) => node.getAttribute('aria-pressed') === 'true',
    );
    expect(pressedChips).toHaveLength(2);
  });

  it('최소 1개 미선택 시 저장 버튼이 비활성화된다', async () => {
    mockApplicantSlots();
    mockAvailabilities([]);

    renderModal();

    const saveButton = await screen.findByRole('button', {
      name: '저장',
      hidden: true,
    });
    expect(saveButton).toBeDisabled();
  });

  it('저장 성공 시 onClose 가 호출되고 mutation 이 호출된다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let receivedPayload: { slotIds: number[] } | null = null;
    mockApplicantSlots();
    mockAvailabilities([1]);
    server.use(
      http.put(
        `*/applications/${APPLICATION_ID}/interview-availabilities`,
        async ({ request }) => {
          receivedPayload = (await request.json()) as { slotIds: number[] };
          return HttpResponse.json({ ok: true, data: null, message: null });
        },
      ),
    );

    renderModal({ onClose });

    // chip 이 그려지고 1 번 slot 이 pressed 로 복원되기를 대기.
    await screen.findAllByRole('button', { name: /10:00 ~ 10:30/, hidden: true });
    await waitFor(() => {
      const pressed = screen
        .getAllByRole('button', { hidden: true })
        .filter((node) => node.getAttribute('aria-pressed') === 'true');
      expect(pressed).toHaveLength(1);
    });

    const saveButton = screen.getByRole('button', {
      name: '저장',
      hidden: true,
    });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(receivedPayload).toEqual({ slotIds: [1] });
  });

  it('저장 시 409 응답이면 모달을 닫고 alert 을 띄운다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    mockApplicantSlots();
    mockAvailabilities([2]);
    server.use(
      http.put(
        `*/applications/${APPLICATION_ID}/interview-availabilities`,
        () =>
          HttpResponse.json(
            {
              ok: false,
              data: null,
              message: '가능시간 수정 기간이 종료되었습니다.',
            },
            { status: 409 },
          ),
      ),
    );

    renderModal({ onClose });

    await screen.findByRole('button', { name: /11:00 ~ 11:30/, hidden: true });
    await waitFor(() => {
      const pressed = screen
        .getAllByRole('button', { hidden: true })
        .filter((node) => node.getAttribute('aria-pressed') === 'true');
      expect(pressed).toHaveLength(1);
    });
    await user.click(
      screen.getByRole('button', { name: '저장', hidden: true }),
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(alertSpy).toHaveBeenCalledWith(
      '수정 기간이 종료되었거나 자동배정이 완료되었습니다.',
    );

    alertSpy.mockRestore();
  });

  it('escape 키로 모달이 닫힌다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApplicantSlots();
    mockAvailabilities([]);

    renderModal({ onClose });

    await screen.findByRole('dialog', { hidden: true });
    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop 클릭 시 모달이 닫힌다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApplicantSlots();
    mockAvailabilities([]);

    const { container } = renderModal({ onClose });

    await screen.findByRole('dialog', { hidden: true });
    // backdrop = dialog 의 부모(aria-hidden) — onClick close.
    const backdrop = container.querySelector('[aria-hidden="true"]');
    if (!backdrop) throw new Error('backdrop not found');
    await user.click(backdrop);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
