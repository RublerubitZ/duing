import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

    await user.click(screen.getByRole('button', { name: '+ 미리보기' }));

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
    await user.click(screen.getByRole('button', { name: '+ 미리보기' }));

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
    await user.click(screen.getByRole('button', { name: '+ 미리보기' }));

    await screen.findByRole('list', { name: '슬롯 미리보기' });

    await user.click(screen.getByRole('button', { name: /\d+개 저장/ }));

    await waitFor(() => {
      expect(screen.getByText(/저장되었습니다/)).toBeInTheDocument();
    });
    expect(postedCount).toBe(2);
    expect(screen.queryByRole('list', { name: '슬롯 미리보기' })).not.toBeInTheDocument();
  });

  it('recruitment.startDate 가 과거이면 패턴 입력이 disabled 되고 안내 메시지가 노출된다', () => {
    renderSection({ recruitmentStartDate: '2020-01-01' });

    expect(
      screen.getByText(/모집이 시작된 후에는 새 슬롯을 추가할 수 없습니다/),
    ).toBeInTheDocument();
    // 패턴 form 자체가 렌더되지 않음
    expect(screen.queryByLabelText('시작 시각')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ 미리보기' })).not.toBeInTheDocument();
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
