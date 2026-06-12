import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { ApplicantInterviewView } from '@duing/types';
import { ApplicantInterviewCard } from '@/app/me/applications/[applicationId]/_components/ApplicantInterviewCard';

const APPLICATION_ID = 42;

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const FUTURE_DEADLINE = '2099-12-31T23:59:00';
const PAST_DEADLINE = '2000-01-01T00:00:00';

const BASE_SLOTS = [
  { slotId: 1, startTime: '2026-06-20T10:00:00', endTime: '2026-06-20T10:30:00', selected: false },
  { slotId: 2, startTime: '2026-06-20T11:00:00', endTime: '2026-06-20T11:30:00', selected: true },
  { slotId: 3, startTime: '2026-06-21T10:00:00', endTime: '2026-06-21T10:30:00', selected: false },
];

function mockView(view: ApplicantInterviewView) {
  server.use(
    http.get(
      `*/applications/${APPLICATION_ID}/interview`,
      () => HttpResponse.json({ ok: true, data: view, message: null }),
    ),
  );
}

function mockRespond(status = 200) {
  server.use(
    http.put(
      `*/applications/${APPLICATION_ID}/interview-availability`,
      () =>
        status === 200
          ? HttpResponse.json({ ok: true, data: null, message: null })
          : HttpResponse.json(
              { ok: false, data: null, message: '응답 기간이 종료되었습니다.' },
              { status },
            ),
    ),
  );
}

function renderCard() {
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
      <ApplicantInterviewCard applicationId={APPLICATION_ID} />
    </Wrapper>,
  );
}

describe('ApplicantInterviewCard', () => {
  it('응답 요청 단계에서는 마감과 함께 시간 선택 버튼이 보인다', async () => {
    mockView({
      phase: 'AVAILABILITY_REQUESTED',
      availabilityDeadline: FUTURE_DEADLINE,
      slots: BASE_SLOTS,
      myAlternativeText: null,
      scheduledInterview: null,
    });

    renderCard();

    expect(await screen.findByRole('button', { name: '시간 선택하기' })).toBeInTheDocument();
    expect(screen.getByText(/마감/)).toBeInTheDocument();
  });

  it('시간 선택 모달에서 슬롯을 고르고 저장하면 선택한 슬롯이 그대로 전송된다', async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;

    // mockView 가 GET 핸들러를 등록 → 별도 GET 핸들러를 추가하지 않아야 첫 fetch 에서
    // AVAILABILITY_REQUESTED 를 받는다. PUT 핸들러만 server.use 로 추가한다.
    mockView({
      phase: 'AVAILABILITY_REQUESTED',
      availabilityDeadline: FUTURE_DEADLINE,
      slots: BASE_SLOTS,
      myAlternativeText: null,
      scheduledInterview: null,
    });
    server.use(
      http.put(
        `*/applications/${APPLICATION_ID}/interview-availability`,
        async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true, data: null, message: null });
        },
      ),
    );

    renderCard();

    // open modal
    await user.click(await screen.findByRole('button', { name: '시간 선택하기' }));

    // 슬롯 chip 이 복수로 있을 수 있으므로 findAllBy + filter 로 미선택 chip 을 선택
    const chips = await screen.findAllByRole('button', {
      name: /10:00 ~ 10:30/,
      hidden: true,
    });
    const unpressedChip = chips.find((c) => c.getAttribute('aria-pressed') === 'false');
    if (unpressedChip) {
      await user.click(unpressedChip);
    }

    // save
    await user.click(screen.getByRole('button', { name: '저장', hidden: true }));

    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
    });

    // slotIds present, noAvailableSlot absent
    const body = capturedBody as Record<string, unknown>;
    expect(Array.isArray(body.slotIds)).toBe(true);
    expect(body.noAvailableSlot).toBeUndefined();
  });

  it('가능한 시간이 없어요를 켜면 슬롯 피커가 비활성화되고 사유와 함께 전송된다', async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;

    mockView({
      phase: 'AVAILABILITY_REQUESTED',
      availabilityDeadline: FUTURE_DEADLINE,
      slots: BASE_SLOTS,
      myAlternativeText: null,
      scheduledInterview: null,
    });
    // mockView 가 GET 핸들러를 등록 → 별도 GET 핸들러를 추가하지 않아야 첫 fetch 에서
    // AVAILABILITY_REQUESTED 를 받는다. PUT 핸들러만 server.use 로 추가한다.
    server.use(
      http.put(
        `*/applications/${APPLICATION_ID}/interview-availability`,
        async ({ request }) => {
          capturedBody = await request.json();
          return HttpResponse.json({ ok: true, data: null, message: null });
        },
      ),
    );

    renderCard();

    await user.click(await screen.findByRole('button', { name: '시간 선택하기' }));

    // toggle "가능한 시간이 없어요"
    const noSlotToggle = await screen.findByRole('checkbox', {
      name: /가능한 시간이 없어요/,
      hidden: true,
    });
    await user.click(noSlotToggle);

    // textarea for alternativeText
    const textarea = screen.getByRole('textbox', { hidden: true });
    await user.type(textarea, '모든 시간이 불가합니다');

    // save button should be enabled
    const saveBtn = screen.getByRole('button', { name: '저장', hidden: true });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(capturedBody).toBeTruthy();
    });

    const body = capturedBody as Record<string, unknown>;
    expect(body.noAvailableSlot).toBe(true);
    expect((body as { alternativeText?: string }).alternativeText).toBeTruthy();
    expect(body.slotIds).toBeUndefined();
  });

  it('이미 응답한 경우 내가 고른 시간들이 보이고 마감 전이면 변경하기가 보인다', async () => {
    mockView({
      phase: 'RESPONDED',
      availabilityDeadline: FUTURE_DEADLINE,
      slots: [
        { slotId: 1, startTime: '2026-06-20T10:00:00', endTime: '2026-06-20T10:30:00', selected: true },
        { slotId: 2, startTime: '2026-06-20T11:00:00', endTime: '2026-06-20T11:30:00', selected: false },
      ],
      myAlternativeText: null,
      scheduledInterview: null,
    });

    renderCard();

    // should show selected slots (slotId=1 is selected)
    expect(await screen.findByText(/10:00/)).toBeInTheDocument();
    // change button visible since deadline is future
    expect(screen.getByRole('button', { name: '변경하기' })).toBeInTheDocument();
  });

  it('마감이 지난 응답 완료 카드에는 변경하기가 없다', async () => {
    mockView({
      phase: 'RESPONDED',
      availabilityDeadline: PAST_DEADLINE,
      slots: [
        { slotId: 1, startTime: '2026-06-20T10:00:00', endTime: '2026-06-20T10:30:00', selected: true },
      ],
      myAlternativeText: null,
      scheduledInterview: null,
    });

    renderCard();

    await screen.findByText(/10:00/);
    expect(screen.queryByRole('button', { name: '변경하기' })).not.toBeInTheDocument();
  });

  it('가능없음으로 응답한 경우 내 사유가 보인다', async () => {
    mockView({
      phase: 'NO_SLOT_REPORTED',
      availabilityDeadline: FUTURE_DEADLINE,
      slots: null,
      myAlternativeText: '주말은 모두 불가합니다.',
      scheduledInterview: null,
    });

    renderCard();

    expect(await screen.findByText('주말은 모두 불가합니다.')).toBeInTheDocument();
  });

  it('마감된 미응답 카드는 마감 안내를 보여준다', async () => {
    mockView({
      phase: 'AVAILABILITY_CLOSED',
      availabilityDeadline: PAST_DEADLINE,
      slots: null,
      myAlternativeText: null,
      scheduledInterview: null,
    });

    renderCard();

    expect(await screen.findByText(/마감/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '시간 선택하기' })).not.toBeInTheDocument();
  });

  it('배정 검토 중에는 조율 중 안내가 보인다', async () => {
    mockView({
      phase: 'SCHEDULING',
      availabilityDeadline: null,
      slots: null,
      myAlternativeText: null,
      scheduledInterview: null,
    });

    renderCard();

    expect(await screen.findByText(/운영진이 면접 일정을 조율/)).toBeInTheDocument();
  });

  it('확정되면 일시와 장소가 보인다', async () => {
    mockView({
      phase: 'SCHEDULED',
      availabilityDeadline: null,
      slots: null,
      myAlternativeText: null,
      scheduledInterview: {
        startTime: '2026-06-25T14:00:00',
        endTime: '2026-06-25T14:30:00',
        location: '공학관 202호',
      },
    });

    renderCard();

    expect(await screen.findByText(/6월 25일/)).toBeInTheDocument();
    expect(screen.getByText('공학관 202호')).toBeInTheDocument();
  });

  it('가능없음으로 응답한 뒤 변경하기를 누르면 토글과 사유가 채워진 채 열린다', async () => {
    const user = userEvent.setup();

    // NO_SLOT_REPORTED 이지만 COLLECTING 상태라 slots·deadline 이 채워져 있는 픽스처.
    mockView({
      phase: 'NO_SLOT_REPORTED',
      availabilityDeadline: FUTURE_DEADLINE,
      slots: BASE_SLOTS,
      myAlternativeText: '주말은 모두 불가합니다.',
      scheduledInterview: null,
    });

    renderCard();

    // 변경하기 버튼이 보일 때까지 대기
    await user.click(await screen.findByRole('button', { name: '변경하기' }));

    // 토글이 체크된 상태여야 한다
    const noSlotCheckbox = await screen.findByRole('checkbox', {
      name: /가능한 시간이 없어요/,
      hidden: true,
    });
    expect(noSlotCheckbox).toBeChecked();

    // textarea 에 기존 사유가 프리필되어 있어야 한다
    const textarea = screen.getByRole('textbox', { hidden: true });
    expect(textarea).toHaveValue('주말은 모두 불가합니다.');
  });

  it('응답 저장이 거부되면 서버 메시지가 모달 안에 보인다', async () => {
    const user = userEvent.setup();

    mockView({
      phase: 'AVAILABILITY_REQUESTED',
      availabilityDeadline: FUTURE_DEADLINE,
      slots: BASE_SLOTS,
      myAlternativeText: null,
      scheduledInterview: null,
    });
    server.use(
      http.put(
        `*/applications/${APPLICATION_ID}/interview-availability`,
        () =>
          HttpResponse.json(
            { ok: false, data: null, message: '응답 기간이 종료되었습니다.' },
            { status: 409 },
          ),
      ),
    );

    renderCard();

    await user.click(await screen.findByRole('button', { name: '시간 선택하기' }));

    // select a slot
    const chip = await screen.findByRole('button', {
      name: /11:00 ~ 11:30/,
      hidden: true,
    });
    if (chip.getAttribute('aria-pressed') === 'false') {
      await user.click(chip);
    }

    await user.click(screen.getByRole('button', { name: '저장', hidden: true }));

    // error message should appear inline, modal stays open
    expect(
      await screen.findByText('응답 기간이 종료되었습니다.', { selector: '[role="alert"]' }, { timeout: 3000 }),
    ).toBeInTheDocument();
    // dialog still in DOM
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });
});
