import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import type { SlotListView } from '@duing/types';
import { InterviewSlotSection } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_components/InterviewSlotSection';

// SlotSection 은 page 가 fetch 한 slots 를 props 로 받는 구조다.
// MSW 는 createSlots(POST) / deleteSlot(DELETE) mutation 만 mock 하면 충분.

const RECRUITMENT_ID = 42;
const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderSection({
  slots = [] as SlotListView[],
  recruitmentStartDate = '2099-01-01',
}: { slots?: SlotListView[]; recruitmentStartDate?: string } = {}) {
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
      <InterviewSlotSection
        recruitmentId={RECRUITMENT_ID}
        recruitmentStartDate={recruitmentStartDate}
        slots={slots}
      />
    </Wrapper>,
  );
}

// 미래 datetime-local 값(YYYY-MM-DDTHH:mm).
function futureLocalDateTime(): string {
  const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${future.getFullYear()}-${pad(future.getMonth() + 1)}-${pad(future.getDate())}T18:00`;
}

describe('InterviewSlotSection — 패턴 + 미리보기 + 저장', () => {
  it('패턴 입력 영역 상단에 누적 미리보기 callout 안내가 노출된다 (Issue 4)', () => {
    renderSection();

    expect(
      screen.getByText(/여러 날짜·비균등 패턴 등록 방법/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/모두 합쳐서 마지막에 한 번에 저장하세요/),
    ).toBeInTheDocument();
  });

  it('preview 가 비어 있어도 저장 영역(빈 상태 안내) 가 항상 노출된다', () => {
    renderSection();

    expect(
      screen.getByText(/미리보기가 비어 있습니다/),
    ).toBeInTheDocument();
  });

  it('패턴 입력 후 미리보기를 누르면 슬롯 N개가 표시된다', async () => {
    const user = userEvent.setup();
    renderSection();

    const startTimeInput = screen.getByLabelText('시작 시각');
    const intervalInput = screen.getByLabelText('간격 (분)');
    const countInput = screen.getByLabelText('슬롯 개수');
    const capacityInput = screen.getByLabelText('슬롯당 정원');

    await user.clear(intervalInput);
    await user.type(intervalInput, '30');
    await user.clear(countInput);
    await user.type(countInput, '4');
    await user.clear(capacityInput);
    await user.type(capacityInput, '2');

    // datetime-local 은 type(...) 으로 입력이 어려우므로 fireEvent-like 방식 — userEvent v14 의 type 은 OK.
    await user.type(startTimeInput, futureLocalDateTime());

    await user.click(screen.getByRole('button', { name: '+ 미리보기에 추가' }));

    const previewList = await screen.findByRole('list', { name: '슬롯 미리보기' });
    expect(previewList).toBeInTheDocument();
    const previewItems = previewList.querySelectorAll('li');
    expect(previewItems).toHaveLength(4);
  });

  it('미리보기 행의 × 버튼을 누르면 1개가 줄어든다', async () => {
    const user = userEvent.setup();
    renderSection();

    const startTimeInput = screen.getByLabelText('시작 시각');
    const countInput = screen.getByLabelText('슬롯 개수');

    await user.clear(countInput);
    await user.type(countInput, '3');
    await user.type(startTimeInput, futureLocalDateTime());
    await user.click(screen.getByRole('button', { name: '+ 미리보기에 추가' }));

    const previewList = await screen.findByRole('list', { name: '슬롯 미리보기' });
    expect(previewList.querySelectorAll('li')).toHaveLength(3);

    // 첫 슬롯의 삭제 버튼 (aria-label 은 "... 슬롯 삭제")
    const removeButtons = previewList.querySelectorAll('button[aria-label$="슬롯 삭제"]');
    expect(removeButtons.length).toBe(3);
    await user.click(removeButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(previewList.querySelectorAll('li')).toHaveLength(2);
    });
  });

  it('저장 성공 후 미리보기가 비워지고 성공 메시지가 노출된다', async () => {
    const user = userEvent.setup();
    let postedCount = 0;
    server.use(
      http.post(
        `*/recruitments/${RECRUITMENT_ID}/interview-slots`,
        async ({ request }) => {
          const body = (await request.json()) as {
            slots: Array<{ startTime: string; endTime: string; capacity: number }>;
          };
          postedCount = body.slots.length;
          return HttpResponse.json({
            ok: true,
            data: { slotIds: body.slots.map((_, index) => index + 1) },
            message: null,
          });
        },
      ),
    );

    renderSection();

    const startTimeInput = screen.getByLabelText('시작 시각');
    const countInput = screen.getByLabelText('슬롯 개수');
    await user.clear(countInput);
    await user.type(countInput, '2');
    await user.type(startTimeInput, futureLocalDateTime());
    await user.click(screen.getByRole('button', { name: '+ 미리보기에 추가' }));

    await screen.findByRole('list', { name: '슬롯 미리보기' });

    await user.click(screen.getByRole('button', { name: /\d+개 저장/ }));

    await waitFor(() => {
      expect(screen.getByText(/저장되었습니다/)).toBeInTheDocument();
    });
    expect(postedCount).toBe(2);
    expect(screen.queryByRole('list', { name: '슬롯 미리보기' })).not.toBeInTheDocument();
    // 저장 영역 자체는 사라지지 않고 "비어있음" 안내로 전환된다.
    expect(screen.getByText(/미리보기가 비어 있습니다/)).toBeInTheDocument();
  });

  it('두 번의 미리보기는 누적된다 (서로 다른 날짜 패턴이 합쳐짐)', async () => {
    const user = userEvent.setup();
    renderSection();

    const startTimeInput = screen.getByLabelText('시작 시각');
    const countInput = screen.getByLabelText('슬롯 개수');
    const capacityInput = screen.getByLabelText('슬롯당 정원');

    // 1차 미리보기 — 2개
    await user.clear(countInput);
    await user.type(countInput, '2');
    await user.clear(capacityInput);
    await user.type(capacityInput, '2');
    await user.type(startTimeInput, futureLocalDateTime());
    await user.click(screen.getByRole('button', { name: '+ 미리보기에 추가' }));

    const firstList = await screen.findByRole('list', { name: '슬롯 미리보기' });
    expect(firstList.querySelectorAll('li')).toHaveLength(2);

    // 2차 미리보기 — 다른 시작 시각으로 3개 더
    const future2 = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    const future2Iso = `${future2.getFullYear()}-${pad(future2.getMonth() + 1)}-${pad(future2.getDate())}T14:00`;

    await user.clear(countInput);
    await user.type(countInput, '3');
    await user.clear(startTimeInput);
    await user.type(startTimeInput, future2Iso);
    await user.click(screen.getByRole('button', { name: '+ 미리보기에 추가' }));

    await waitFor(() => {
      const list = screen.getByRole('list', { name: '슬롯 미리보기' });
      expect(list.querySelectorAll('li')).toHaveLength(5);
    });
    expect(screen.getByRole('button', { name: /5개 저장/ })).toBeInTheDocument();
  });

  it('미리보기 비우기 클릭 시 전체 초기화된다', async () => {
    const user = userEvent.setup();
    renderSection();

    const startTimeInput = screen.getByLabelText('시작 시각');
    const countInput = screen.getByLabelText('슬롯 개수');
    await user.clear(countInput);
    await user.type(countInput, '3');
    await user.type(startTimeInput, futureLocalDateTime());
    await user.click(screen.getByRole('button', { name: '+ 미리보기에 추가' }));

    await screen.findByRole('list', { name: '슬롯 미리보기' });

    await user.click(screen.getByRole('button', { name: '미리보기 비우기' }));

    await waitFor(() => {
      expect(screen.queryByRole('list', { name: '슬롯 미리보기' })).not.toBeInTheDocument();
    });
    expect(screen.getByText(/미리보기가 비어 있습니다/)).toBeInTheDocument();
  });

  it('schema validation 실패 시 callout 박스로 에러 메시지가 노출된다', async () => {
    renderSection();

    // 사용자가 startTime 을 비운 상태(또는 과거)로 제출 시 zod 실패 → callout 박스 노출.
    // HTML5 required/min 가 form submit 을 막을 수 있으므로 fireEvent.submit 으로
    // constraint validation 을 우회하여 onSubmit 핸들러를 직접 트리거한다.
    const submitButton = screen.getByRole('button', { name: '+ 미리보기에 추가' });
    const form = submitButton.closest('form');
    expect(form).not.toBeNull();

    fireEvent.submit(form as HTMLFormElement);

    const alert = await screen.findByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('입력값을 확인해주세요');
  });

  it('recruitment.startDate 가 과거이면 패턴 입력이 disabled 되고 안내 메시지가 노출된다', () => {
    renderSection({ recruitmentStartDate: '2020-01-01' });

    expect(
      screen.getByText(/모집이 시작된 후에는 새 슬롯을 추가할 수 없습니다/),
    ).toBeInTheDocument();
    // 패턴 form 자체가 렌더되지 않음
    expect(screen.queryByLabelText('시작 시각')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ 미리보기에 추가' })).not.toBeInTheDocument();
  });

  // 백엔드 정책(`LocalDate.now().isAfter(startDate)`) 과 정렬:
  // 시작일 당일(today == startDate) 은 신규 슬롯 추가가 여전히 허용된다.
  it('recruitment.startDate 가 오늘이면 패턴 입력 form 이 렌더된다', () => {
    const today = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    renderSection({ recruitmentStartDate: todayIso });

    expect(
      screen.queryByText(/모집이 시작된 후에는 새 슬롯을 추가할 수 없습니다/),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText('시작 시각')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ 미리보기에 추가' })).toBeInTheDocument();
  });

  it('recruitment.startDate 의 익일(어제) 이면 패턴 입력이 차단된다', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pad = (value: number) => String(value).padStart(2, '0');
    const yesterdayIso = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

    renderSection({ recruitmentStartDate: yesterdayIso });

    expect(
      screen.getByText(/모집이 시작된 후에는 새 슬롯을 추가할 수 없습니다/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('시작 시각')).not.toBeInTheDocument();
  });

  it('기존 슬롯은 ManagementSlotCard 그리드로 표시되고 × 클릭 시 DELETE 가 호출된다', async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    let deletedSlotId: number | null = null;
    server.use(
      http.delete(`*/interview-slots/:slotId`, ({ params }) => {
        deletedSlotId = Number(params.slotId);
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderSection({
      slots: [
        {
          slotId: 7,
          startTime: '2099-06-18T18:00:00',
          endTime: '2099-06-18T18:30:00',
          capacity: 2,
          availabilityCount: 0,
          assignedCount: 0,
        },
      ],
    });

    expect(screen.getByText(/현재 슬롯/)).toBeInTheDocument();
    const deleteButton = screen.getByRole('button', { name: '슬롯 삭제' });
    await user.click(deleteButton);

    await waitFor(() => {
      expect(deletedSlotId).toBe(7);
    });

    confirmSpy.mockRestore();
  });
});
