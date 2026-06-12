import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
import { RoundDashboard } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/rounds/[roundId]/_components/RoundDashboard';
import { InterviewRoundsLanding } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/_pages/InterviewRoundsLanding';

// MSW 기반 통합 테스트 — 면접 라운드 dashboard.
// TanStack Query 자체를 mock 하지 않고 네트워크 레벨에서 mocking 한다.

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const ROUND_ID = 42;

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

// ── 공통 픽스처 ──────────────────────────────────────────────────────────────

const SLOT_A = {
  slotId: 10,
  startTime: '2026-07-15T10:00:00',
  endTime: '2026-07-15T10:30:00',
  capacity: 2,
  selectedCount: 1,
  assignedCount: 0,
};

const SLOT_B = {
  slotId: 11,
  startTime: '2026-07-15T11:00:00',
  endTime: '2026-07-15T11:30:00',
  capacity: 2,
  selectedCount: 0,
  assignedCount: 1,
};

/** COLLECTING 마감 전 픽스처 — invitedCount > 0 */
const DETAIL_COLLECTING_BEFORE_DEADLINE = {
  roundId: ROUND_ID,
  title: '1차 면접',
  status: 'COLLECTING',
  availabilityDeadline: '2099-07-10T18:00:00',
  location: '공학관',
  requestSequence: 1,
  deadlinePassed: false,
  counts: {
    totalMemberCount: 5,
    invitedCount: 2,
    respondedCount: 3,
    noAvailableSlotCount: 0,
    assignedCount: 0,
    excludedCount: 0,
    unrespondedCount: 2,
  },
  members: [
    {
      memberId: 1,
      applicationId: 1,
      userName: '홍길동',
      studentId: '20220001',
      status: 'RESPONDED',
      unresponded: false,
      alternativeAvailabilityText: null,
      selectedSlotCount: 2,
      assignedSlotId: null,
    },
    {
      memberId: 2,
      applicationId: 2,
      userName: '김철수',
      studentId: '20220002',
      status: 'INVITED',
      unresponded: true,
      alternativeAvailabilityText: null,
      selectedSlotCount: 0,
      assignedSlotId: null,
    },
  ],
  slots: [SLOT_A],
};

/** COLLECTING 마감 후 픽스처 — deadlinePassed=true */
const DETAIL_COLLECTING_DEADLINE_PASSED = {
  ...DETAIL_COLLECTING_BEFORE_DEADLINE,
  deadlinePassed: true,
  counts: {
    ...DETAIL_COLLECTING_BEFORE_DEADLINE.counts,
    invitedCount: 0,
    unrespondedCount: 2,
  },
};

/** 전원 응답 완료 픽스처 — invitedCount=0, 비EXCLUDED 멤버 존재 */
const DETAIL_ALL_RESPONDED = {
  ...DETAIL_COLLECTING_BEFORE_DEADLINE,
  deadlinePassed: false,
  counts: {
    ...DETAIL_COLLECTING_BEFORE_DEADLINE.counts,
    invitedCount: 0,
    respondedCount: 5,
  },
  members: [
    {
      memberId: 1,
      applicationId: 1,
      userName: '홍길동',
      studentId: '20220001',
      status: 'RESPONDED',
      unresponded: false,
      alternativeAvailabilityText: null,
      selectedSlotCount: 2,
      assignedSlotId: null,
    },
  ],
};

/** 가능없음 멤버 포함 픽스처 */
const DETAIL_WITH_NO_SLOT_MEMBER = {
  ...DETAIL_COLLECTING_BEFORE_DEADLINE,
  counts: {
    ...DETAIL_COLLECTING_BEFORE_DEADLINE.counts,
    noAvailableSlotCount: 1,
  },
  members: [
    {
      memberId: 3,
      applicationId: 3,
      userName: '이영희',
      studentId: '20220003',
      status: 'NO_AVAILABLE_SLOT',
      unresponded: false,
      alternativeAvailabilityText: '주말 오후는 가능합니다',
      selectedSlotCount: 0,
      assignedSlotId: null,
    },
  ],
};

/** ASSIGNING 픽스처 */
const DETAIL_ASSIGNING = {
  roundId: ROUND_ID,
  title: '1차 면접',
  status: 'ASSIGNING',
  availabilityDeadline: '2026-07-10T18:00:00',
  location: '공학관',
  requestSequence: 1,
  deadlinePassed: true,
  counts: {
    totalMemberCount: 5,
    invitedCount: 0,
    respondedCount: 4,
    noAvailableSlotCount: 0,
    assignedCount: 3,
    excludedCount: 0,
    unrespondedCount: 1,
  },
  members: [
    {
      memberId: 1,
      applicationId: 1,
      userName: '홍길동',
      studentId: '20220001',
      status: 'ASSIGNED',
      unresponded: false,
      alternativeAvailabilityText: null,
      selectedSlotCount: 2,
      assignedSlotId: 10,
    },
    {
      memberId: 2,
      applicationId: 2,
      userName: '김철수',
      studentId: '20220002',
      status: 'RESPONDED',
      unresponded: false,
      alternativeAvailabilityText: null,
      selectedSlotCount: 1,
      assignedSlotId: null,
    },
  ],
  slots: [SLOT_A, SLOT_B],
};

// ── 테스트 설정 ──────────────────────────────────────────────────────────────

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderDashboard(roundId = ROUND_ID) {
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
      <RoundDashboard clubId={CLUB_ID} recruitmentId={RECRUITMENT_ID} roundId={roundId} />
    </Wrapper>,
  );
}

function renderLanding() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
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
      <InterviewRoundsLanding clubId={CLUB_ID} recruitmentId={RECRUITMENT_ID} />
    </Wrapper>,
  );
}

// ── 테스트 15건 + 랜딩 1건 ───────────────────────────────────────────────────

describe('RoundDashboard — 면접 라운드 dashboard', () => {
  it('1. 수집 중 dashboard 에 카운트 카드와 멤버 테이블이 보인다 (마감 전 — 응답 대기 라벨)', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      // 상태 배너
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    // 카운트 카드 — invitedCount 는 마감 전이면 "응답 대기" 라벨 (카드 헤더에만 노출)
    expect(screen.getByText('응답 대기')).toBeInTheDocument();
    // 카운트 카드에 "응답 완료" 라벨이 있어야 함 (getAllByText 로 복수 허용)
    expect(screen.getAllByText('응답 완료').length).toBeGreaterThanOrEqual(1);

    // 멤버 테이블 — 이름 노출
    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('김철수')).toBeInTheDocument();
  });

  it('2. 마감이 지나면 미응답 라벨과 파생 미응답 강조가 보인다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_DEADLINE_PASSED, message: null }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    // 마감 후엔 "미응답" — 카운트 카드 라벨 + 파생 미응답 멤버 뱃지 2곳
    expect(screen.getAllByText('미응답').length).toBeGreaterThanOrEqual(2);
    // "응답 대기"는 없어야 함
    expect(screen.queryByText('응답 대기')).not.toBeInTheDocument();
  });

  it('3. 전원이 응답하면 조기 배정 배너가 보인다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ALL_RESPONDED, message: null }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      // 전원 응답 완료 조기 배정 배너
      expect(screen.getByText(/전원 응답 완료/)).toBeInTheDocument();
    });
  });

  it('4. 미응답자가 있는 채로 마감 전 자동배정을 누르면 N명 제외 경고 모달 후 실행된다', async () => {
    let autoAssignCalled = false;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/auto-assign`, () => {
        autoAssignCalled = true;
        return HttpResponse.json({
          ok: true,
          data: { assignedMemberCount: 3, unassignedMemberCount: 0 },
          message: null,
        });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    // [자동배정 실행] 버튼 클릭
    const autoAssignButton = screen.getByRole('button', { name: /자동배정/ });
    await userEvent.click(autoAssignButton);

    // 경고 모달 — invitedCount(2) 명 제외 안내
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog4 = screen.getByRole('dialog');
    expect(within(dialog4).getByText(/2명/)).toBeInTheDocument();

    // 확인 버튼 클릭 → POST 요청 (dialog 내부의 배정 실행 버튼)
    const confirmButton = within(dialog4).getByRole('button', { name: /배정 실행/ });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(autoAssignCalled).toBe(true);
    });
  });

  it('5. 배정 검토 중 재실행은 재계산 경고 모달을 거친다', async () => {
    let autoAssignCalled = false;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/auto-assign`, () => {
        autoAssignCalled = true;
        return HttpResponse.json({
          ok: true,
          data: { assignedMemberCount: 3, unassignedMemberCount: 0 },
          message: null,
        });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('배정 검토 중')).toBeInTheDocument();
    });

    // [자동배정 재실행] 버튼 클릭
    const rerunButton = screen.getByRole('button', { name: /자동배정/ });
    await userEvent.click(rerunButton);

    // 재계산 경고 모달
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog5 = screen.getByRole('dialog');
    expect(within(dialog5).getByText(/다시 계산/)).toBeInTheDocument();

    // 확인 → POST (dialog 내부의 재실행 버튼)
    const confirmButton = within(dialog5).getByRole('button', { name: /재실행/ });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(autoAssignCalled).toBe(true);
    });
  });

  it('6. 가능없음 멤버의 사유가 전용 섹션에 보인다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_WITH_NO_SLOT_MEMBER, message: null }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    // 가능없음 섹션에 alternativeText 노출
    expect(screen.getByText('주말 오후는 가능합니다')).toBeInTheDocument();
    // 멤버 이름
    expect(screen.getByText('이영희')).toBeInTheDocument();
  });

  it('7. 멤버를 제외하면 확인 모달 후 제외 요청이 간다', async () => {
    let capturedUrl: string | null = null;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/members/:memberId/exclude`, ({ request }) => {
        capturedUrl = request.url;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('홍길동')).toBeInTheDocument();
    });

    // [제외] 버튼 클릭 (홍길동 행)
    const excludeButtons = screen.getAllByRole('button', { name: /제외/ });
    await userEvent.click(excludeButtons[0]!);

    // 확인 모달
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText(/대기열/)).toBeInTheDocument();

    // 확인 → POST
    const confirmButton = screen.getByRole('button', { name: /확인/ });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(capturedUrl).toContain('exclude');
    });
  });

  it('8. 배정 검토 중 멤버에게 수동 배정 모달로 슬롯을 지정할 수 있다', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING, message: null }),
      ),
      http.put(`*/interview-rounds/${ROUND_ID}/members/:memberId/schedule`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('배정 검토 중')).toBeInTheDocument();
    });

    // 배정되지 않은 멤버(김철수)의 [수동 배정] 버튼
    const assignButtons = screen.getAllByRole('button', { name: /수동 배정/ });
    await userEvent.click(assignButtons[0]!);

    // 수동 배정 모달 — 슬롯 목록
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog8 = screen.getByRole('dialog');

    // 슬롯 선택 라디오
    const slotRadios = within(dialog8).getAllByRole('radio');
    expect(slotRadios.length).toBeGreaterThan(0);
    await userEvent.click(slotRadios[0]!);

    // [배정] 확인 — 모달 내부 버튼
    const saveButton = within(dialog8).getByRole('button', { name: '배정' });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ slotId: expect.any(Number) });
    });
  });

  it('9. 확정이 거부되면 미응답·만석 두 그룹이 분리되어 보이고 강제 확정을 제안한다', async () => {
    const unresolvedPayload = {
      code: 'INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS',
      unresponded: [
        { applicationId: 1, applicantName: '홍길동', memberStatus: 'INVITED' },
      ],
      respondedUnassigned: [
        { applicationId: 2, applicantName: '김철수', selectedSlotIds: [10, 11] },
      ],
    };

    let forceConfirmCalled = false;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, ({ request }) => {
        const url = new URL(request.url);
        const force = url.searchParams.get('force');
        if (force === 'true') {
          forceConfirmCalled = true;
          return HttpResponse.json({
            ok: true,
            data: { assignedMemberCount: 3, excludedMemberCount: 1 },
            message: null,
          });
        }
        return HttpResponse.json(
          { ok: false, data: unresolvedPayload, message: '미처리 멤버가 있습니다.' },
          { status: 409 },
        );
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('배정 검토 중')).toBeInTheDocument();
    });

    // [확정] 버튼
    const confirmButton = screen.getByRole('button', { name: /^확정$/ });
    await userEvent.click(confirmButton);

    // 409 → ConfirmRoundDialog — 두 그룹 분리 렌더
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    const dialog9 = screen.getByRole('dialog');
    expect(within(dialog9).getByText('홍길동')).toBeInTheDocument();
    expect(within(dialog9).getByText('김철수')).toBeInTheDocument();

    // [강제 확정] 버튼 클릭 → force=true
    const forceButton = within(dialog9).getByRole('button', { name: /강제 확정/ });
    await userEvent.click(forceButton);

    await waitFor(() => {
      expect(forceConfirmCalled).toBe(true);
    });
  });

  it('10. 확정이 성공하면 알림 인원과 함께 완료 배너가 보인다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, () =>
        HttpResponse.json({
          ok: true,
          data: { assignedMemberCount: 4, excludedMemberCount: 0 },
          message: null,
        }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('배정 검토 중')).toBeInTheDocument();
    });

    const confirmButton = screen.getByRole('button', { name: /^확정$/ });
    await userEvent.click(confirmButton);

    // 확정 성공 — 피드백 메시지에 4명 포함
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/4명/);
    });
  });

  it('11. 재알림 성공 시 발송 인원이 보인다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/remind`, () =>
        HttpResponse.json({
          ok: true,
          data: { notifiedMemberCount: 2 },
          message: null,
        }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    const remindButton = screen.getByRole('button', { name: /재알림/ });
    await userEvent.click(remindButton);

    // 재알림 성공 — 피드백 메시지에 2명 포함
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/2명/);
    });
  });

  it('12. 마감 연장 모달은 연장만 가능함을 안내하고 PATCH 를 보낸다', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.patch(`*/interview-rounds/${ROUND_ID}`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    const extendButton = screen.getByRole('button', { name: /마감 연장/ });
    await userEvent.click(extendButton);

    // 연장 안내 모달
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // "연장만" 안내 텍스트
    expect(screen.getByText(/연장만/)).toBeInTheDocument();

    // datetime input 에 새 값 입력 (datetime-local 은 fireEvent.change 로 설정)
    const datetimeInput = screen.getByLabelText(/마감 일시/);
    fireEvent.change(datetimeInput, { target: { value: '2099-08-01T18:00' } });

    const saveButton = screen.getByRole('button', { name: /저장/ });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ availabilityDeadline: expect.any(String) });
    });
  });

  it('13. 라운드 취소는 대기열 복귀 안내 확인 후 실행된다', async () => {
    let cancelCalled = false;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () => {
        cancelCalled = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /라운드 취소/ });
    await userEvent.click(cancelButton);

    // 취소 확인 모달
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText(/대기열로 복귀/)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: /확인/ });
    await userEvent.click(confirmButton);

    await waitFor(() => {
      expect(cancelCalled).toBe(true);
    });
  });

  it('14. 수집 중 슬롯 추가 생성 시 재초대 인원이 안내된다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/slots`, () =>
        HttpResponse.json({
          ok: true,
          data: { createdSlotIds: [20], reinvitedMemberCount: 3 },
          message: null,
        }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    // 슬롯 섹션의 [슬롯 생성] 폼 입력
    const dateInput = screen.getByLabelText(/시작 날짜/);
    const startTimeInput = screen.getByLabelText(/시작 시각/);
    const endTimeInput = screen.getByLabelText(/종료 시각/);

    await userEvent.type(dateInput, '2026-07-20');
    await userEvent.type(startTimeInput, '09:00');
    await userEvent.type(endTimeInput, '10:00');

    const createButton = screen.getByRole('button', { name: /슬롯 생성/ });
    await userEvent.click(createButton);

    // reinvitedMemberCount=3 안내
    await waitFor(() => {
      expect(screen.getByText(/3명/)).toBeInTheDocument();
    });
  });

  it('15. 수집 중 슬롯 정원을 수정하면 PATCH 가 간다', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.patch(`*/interview-slots/${SLOT_A.slotId}`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('응답 수집 중')).toBeInTheDocument();
    });

    // 슬롯 행의 [정원 수정] → 인라인 number input 노출
    await userEvent.click(screen.getByRole('button', { name: /정원 수정/ }));

    const capacityInput = screen.getByLabelText('새 정원');
    fireEvent.change(capacityInput, { target: { value: '5' } });

    // [저장] → PATCH {capacity}
    await userEvent.click(screen.getByRole('button', { name: '정원 저장' }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ capacity: 5 });
    });
  });
});

// ── 랜딩 링크 테스트 1건 ────────────────────────────────────────────────────

describe('InterviewRoundsLanding — 비DRAFT 카드 dashboard 링크', () => {
  it('진행 중 라운드 카드가 dashboard 로 링크된다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({
          ok: true,
          data: [
            {
              roundId: ROUND_ID,
              title: '2차 면접',
              status: 'COLLECTING',
              availabilityDeadline: '2026-07-10T18:00:00',
              location: '공학관',
              totalMemberCount: 3,
              respondedMemberCount: 2,
            },
          ],
          message: null,
        }),
      ),
    );

    renderLanding();

    await waitFor(() => {
      expect(screen.getByText('2차 면접')).toBeInTheDocument();
    });

    // 비DRAFT 카드에 dashboard 링크 (rounds/[roundId])
    const dashboardLink = screen.getByRole('link', { name: /현황 보기/ });
    expect(dashboardLink).toBeInTheDocument();
    const href = dashboardLink.getAttribute('href');
    expect(href).toContain(`rounds/${ROUND_ID}`);
  });
});
