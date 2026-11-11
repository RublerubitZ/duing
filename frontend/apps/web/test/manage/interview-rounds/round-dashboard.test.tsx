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

/** SCHEDULED 픽스처 — 확정된 라운드, ASSIGNED 멤버 포함 */
const DETAIL_SCHEDULED = {
  roundId: ROUND_ID,
  title: '1차 면접',
  status: 'SCHEDULED',
  availabilityDeadline: '2026-07-10T18:00:00',
  location: '공학관',
  requestSequence: 1,
  deadlinePassed: true,
  counts: {
    totalMemberCount: 3,
    invitedCount: 0,
    respondedCount: 3,
    noAvailableSlotCount: 0,
    assignedCount: 3,
    excludedCount: 0,
    unrespondedCount: 0,
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
      status: 'ASSIGNED',
      unresponded: false,
      alternativeAvailabilityText: null,
      selectedSlotCount: 1,
      assignedSlotId: 11,
    },
  ],
  slots: [SLOT_A, SLOT_B],
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

const FREED_SLOT_20 = { slotId: 20, startTime: '2026-07-15T13:00:00', endTime: '2026-07-15T13:30:00', capacity: 1, selectedCount: 1, assignedCount: 0 };
const FULL_SLOT_21 = { slotId: 21, startTime: '2026-07-15T14:00:00', endTime: '2026-07-15T14:30:00', capacity: 1, selectedCount: 3, assignedCount: 1 };
const OPEN_SLOT_22 = { slotId: 22, startTime: '2026-07-15T15:00:00', endTime: '2026-07-15T15:30:00', capacity: 2, selectedCount: 1, assignedCount: 0 };

const MEMBER_DECIDED = { memberId: 101, applicationId: 101, userName: '정하늘', studentId: '20230101', status: 'EXCLUDED', unresponded: false, alternativeAvailabilityText: null, selectedSlotCount: 0, assignedSlotId: null };
const MEMBER_WANTS_20 = { memberId: 102, applicationId: 102, userName: '최유리', studentId: '20230102', status: 'RESPONDED', unresponded: false, alternativeAvailabilityText: null, selectedSlotCount: 3, assignedSlotId: null };
const MEMBER_WANTS_21 = { memberId: 103, applicationId: 103, userName: '한지민', studentId: '20230103', status: 'RESPONDED', unresponded: false, alternativeAvailabilityText: null, selectedSlotCount: 1, assignedSlotId: null };
const MEMBER_HOLDS_21 = { memberId: 104, applicationId: 104, userName: '오세훈', studentId: '20230104', status: 'RESPONDED', unresponded: false, alternativeAvailabilityText: null, selectedSlotCount: 1, assignedSlotId: 21 };

/** ASSIGNING — X(정하늘)의 결과를 정한 뒤: 가능 시간·초안 배정이 지워져 슬롯 20 이 빈다. 배정받지 못한 응답자 2명(최유리·한지민)·남은 자리 3개(슬롯 20 의 1 + 22 의 2) */
const DETAIL_ASSIGNING_FREED_SEAT = {
  roundId: ROUND_ID,
  title: '1차 면접',
  status: 'ASSIGNING',
  availabilityDeadline: '2026-07-10T18:00:00',
  location: '공학관',
  requestSequence: 1,
  deadlinePassed: true,
  counts: {
    totalMemberCount: 3,
    invitedCount: 0,
    respondedCount: 3,
    noAvailableSlotCount: 0,
    assignedCount: 0,
    excludedCount: 1,
    unrespondedCount: 0,
  },
  members: [MEMBER_DECIDED, MEMBER_WANTS_20, MEMBER_WANTS_21, MEMBER_HOLDS_21],
  slots: [FREED_SLOT_20, FULL_SLOT_21, OPEN_SLOT_22],
};

/**
 * 같은 라운드의 낡은 상세 — X 의 결과를 정하기 전이라 X 가 슬롯 20 을 쥐어 최유리가 고른 20 이 꽉 찼고,
 * 오세훈이 21 에 배정되기 전이라 최유리·한지민이 고른 21 은 비어 보인다(이 상세로 판정하면 둘에게 거짓 표시).
 */
const DETAIL_ASSIGNING_BEFORE_RELEASE = {
  ...DETAIL_ASSIGNING_FREED_SEAT,
  counts: { ...DETAIL_ASSIGNING_FREED_SEAT.counts, totalMemberCount: 4, respondedCount: 4, excludedCount: 0 },
  members: [
    { ...MEMBER_DECIDED, status: 'RESPONDED', selectedSlotCount: 1, assignedSlotId: 20 },
    MEMBER_WANTS_20,
    MEMBER_WANTS_21,
    { ...MEMBER_HOLDS_21, assignedSlotId: null },
  ],
  slots: [{ ...FREED_SLOT_20, selectedCount: 2, assignedCount: 1 }, { ...FULL_SLOT_21, assignedCount: 0 }, OPEN_SLOT_22],
};

/** 확정 409 명단 — 최유리는 21(꽉 참)·22·20(빈 자리 있음 — 고른 순서와 시간순이 다르다), 한지민은 21(꽉 참)을 골랐다 */
const FREED_SEAT_UNRESOLVED_PAYLOAD = {
  code: 'INTERVIEW_ROUND_HAS_UNRESOLVED_MEMBERS',
  unresponded: [],
  respondedUnassigned: [
    { applicationId: 102, applicantName: '최유리', selectedSlotIds: [21, 22, 20] },
    { applicationId: 103, applicantName: '한지민', selectedSlotIds: [21] },
  ],
};

/** 남은 자리 0개 — 오세훈이 21 을 쥐고, 한지민은 21 만 골라 못 받았다 */
const DETAIL_ASSIGNING_NO_FREE_SEAT = {
  ...DETAIL_ASSIGNING_FREED_SEAT,
  counts: { ...DETAIL_ASSIGNING_FREED_SEAT.counts, totalMemberCount: 2, respondedCount: 2, excludedCount: 0 },
  members: [MEMBER_WANTS_21, MEMBER_HOLDS_21],
  slots: [{ ...FULL_SLOT_21, selectedCount: 2 }],
};

/** 배정받지 못한 응답자 0명 — 남은 자리는 있지만 제외·가능없음·미응답뿐: 셋 다 세지 않는다 */
const DETAIL_ASSIGNING_NO_UNASSIGNED_RESPONDED = {
  ...DETAIL_ASSIGNING_FREED_SEAT,
  counts: { totalMemberCount: 2, invitedCount: 1, respondedCount: 0, noAvailableSlotCount: 1, assignedCount: 0, excludedCount: 1, unrespondedCount: 1 },
  members: [
    MEMBER_DECIDED,
    { memberId: 105, applicationId: 105, userName: '윤가람', studentId: '20230105', status: 'NO_AVAILABLE_SLOT', unresponded: false, alternativeAvailabilityText: '주말만 가능합니다', selectedSlotCount: 0, assignedSlotId: null },
    { memberId: 106, applicationId: 106, userName: '서도윤', studentId: '20230106', status: 'INVITED', unresponded: true, alternativeAvailabilityText: null, selectedSlotCount: 0, assignedSlotId: null },
  ],
  slots: [{ ...FREED_SLOT_20, selectedCount: 0 }],
};

/** 응답 수집 중 — 초안 배정이 없어 응답자 전원이 배정 없음 */
const DETAIL_COLLECTING_WITH_FREE_SEAT = {
  ...DETAIL_ASSIGNING_FREED_SEAT,
  status: 'COLLECTING',
  deadlinePassed: false,
  members: DETAIL_ASSIGNING_FREED_SEAT.members.map((member) => ({ ...member, assignedSlotId: null })),
  slots: DETAIL_ASSIGNING_FREED_SEAT.slots.map((slot) => ({ ...slot, assignedCount: 0 })),
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

    // 확인 → POST (확인 버튼은 행동 이름으로 쓴다 — 다이얼로그의 "취소" 와 헷갈리지 않게)
    const confirmButton = within(screen.getByRole('dialog')).getByRole('button', { name: '제외하기' });
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

    // 확인 버튼은 "확인" 이 아니라 행동 이름 — 다이얼로그의 "취소" 와 구분된다.
    const confirmButton = within(screen.getByRole('dialog')).getByRole('button', { name: '라운드 취소하기' });
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

  it('16. SCHEDULED 라운드에서 슬롯 추가 폼이 노출된다 (재초대 토스트 없음)', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/slots`, () =>
        HttpResponse.json({
          ok: true,
          data: { createdSlotIds: [30], reinvitedMemberCount: 0 },
          message: null,
        }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('확정')).toBeInTheDocument();
    });

    // SCHEDULED 에서도 슬롯 패턴 폼이 노출되어야 한다
    expect(screen.getByLabelText(/시작 날짜/)).toBeInTheDocument();

    // 슬롯 생성 후 reinvitedMemberCount=0 → 재초대 토스트 없음
    const dateInput = screen.getByLabelText(/시작 날짜/);
    const startTimeInput = screen.getByLabelText(/시작 시각/);
    const endTimeInput = screen.getByLabelText(/종료 시각/);
    await userEvent.type(dateInput, '2026-07-20');
    await userEvent.type(startTimeInput, '09:00');
    await userEvent.type(endTimeInput, '10:00');

    await userEvent.click(screen.getByRole('button', { name: /슬롯 생성/ }));

    // 재초대 안내가 없어야 한다
    await waitFor(() => {
      expect(screen.queryByText(/재초대/)).not.toBeInTheDocument();
    });
  });

  it('17. SCHEDULED 에서 ASSIGNED 멤버 행에 [일정 변경] 버튼이 노출되고 배정 모달에 안내 문구가 보인다', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null }),
      ),
      http.put(`*/interview-rounds/${ROUND_ID}/members/:memberId/schedule`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('확정')).toBeInTheDocument();
    });

    // ASSIGNED 멤버에 [일정 변경] 버튼이 있어야 한다
    const rescheduleButtons = screen.getAllByRole('button', { name: /일정 변경/ });
    expect(rescheduleButtons.length).toBeGreaterThan(0);

    // 클릭 → 배정 모달 노출
    await userEvent.click(rescheduleButtons[0]!);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // 모달에 일정 변경 알림 안내 문구가 있어야 한다
    expect(screen.getByText('변경 시 지원자에게 일정 변경 알림이 발송됩니다.')).toBeInTheDocument();

    // 슬롯 라디오 선택 후 배정 → PUT 요청
    const slotRadios = within(screen.getByRole('dialog')).getAllByRole('radio');
    await userEvent.click(slotRadios[0]!);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '배정' }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ slotId: expect.any(Number) });
    });
  });

  it('18. SCHEDULED 에서 배정 참조 슬롯 삭제 시 409 메시지가 그대로 노출된다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null }),
      ),
      http.delete(`*/interview-slots/${SLOT_A.slotId}`, () =>
        HttpResponse.json(
          { ok: false, data: null, message: '배정된 면접이 있는 슬롯입니다.' },
          { status: 409 },
        ),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('확정')).toBeInTheDocument();
    });

    // 슬롯 삭제 버튼 클릭 → 확인 모달에서 [삭제] 를 눌러야 요청이 나간다
    const deleteButtons = screen.getAllByRole('button', { name: /슬롯 삭제/ });
    await userEvent.click(deleteButtons[0]!);
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: '삭제' }),
    );

    // 409 서버 메시지가 인라인 role="alert" 로 노출된다
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('배정된 면접이 있는 슬롯입니다.');
    });
  });

  it('19. SCHEDULED 에서 [해제]·[제외] 버튼이 보이지 않는다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null }),
      ),
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('확정')).toBeInTheDocument();
    });

    // 해제·제외 버튼이 없어야 한다
    expect(screen.queryByRole('button', { name: /해제/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^제외$/ })).not.toBeInTheDocument();
  });
});

// ── 배정 검토 — 빈 자리 안내 ────────────────────────────────────────────────

const CONFIRM_REJECTED_FREED_SEAT_HANDLER = http.post(`*/interview-rounds/${ROUND_ID}/confirm`, () =>
  HttpResponse.json(
    { ok: false, data: FREED_SEAT_UNRESOLVED_PAYLOAD, message: '미처리 멤버가 있습니다.' },
    { status: 409 },
  ),
);

describe('배정 검토 — 빈 자리 안내', () => {
  it('확정이 거부되면 고른 시간에 빈 자리가 있는 미배정 응답자에게만 빈 자리 표시가 보인다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_FREED_SEAT, message: null }),
      ),
      CONFIRM_REJECTED_FREED_SEAT_HANDLER,
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(screen.getByRole('button', { name: /^확정$/ }));
    const dialog = await screen.findByRole('dialog');

    await waitFor(() =>
      expect(within(dialog).getByText('최유리').closest('li')).toHaveTextContent('선택 슬롯 3개 · 고른 시간에 빈 자리 있음(7월 15일 13:00 ~ 13:30, 7월 15일 15:00 ~ 15:30)'),
    );
    expect(within(dialog).getByText('한지민').closest('li')).toHaveTextContent('선택 슬롯 1개');
    expect(within(dialog).getByText('한지민').closest('li')).not.toHaveTextContent('고른 시간에 빈 자리 있음');
    // 좁은 폭에서 '있 / 음(' 처럼 음절 사이에서 끊기지 않게.
    expect(within(dialog).getByText('최유리').nextElementSibling).toHaveClass('break-keep', '[overflow-wrap:anywhere]');
  });

  it('확정이 거부되면 창은 바로 열리고, 빈 자리 표시는 라운드 상세를 다시 받은 뒤에 보인다', async () => {
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, async () => {
        detailGetCount += 1;
        if (detailGetCount === 1) {
          return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_BEFORE_RELEASE, message: null });
        }
        await refetchGate;
        return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_FREED_SEAT, message: null });
      }),
      CONFIRM_REJECTED_FREED_SEAT_HANDLER,
    );

    try {
      renderDashboard();
      await screen.findByText('배정 검토 중');
      await userEvent.click(screen.getByRole('button', { name: /^확정$/ }));

      // 재조회를 붙잡은 동안 — 창과 [강제 확정]은 기다리지 않고, 낡은 상세로는 표시하지 않는다
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: /강제 확정/ })).toBeEnabled();
      expect(within(dialog).getByText('최유리').closest('li')).not.toHaveTextContent('고른 시간에 빈 자리 있음');
      expect(within(dialog).getByText('한지민').closest('li')).not.toHaveTextContent('고른 시간에 빈 자리 있음');

      releaseRefetch();
      await waitFor(() =>
        expect(within(dialog).getByText('최유리').closest('li')).toHaveTextContent('고른 시간에 빈 자리 있음(7월 15일 13:00 ~ 13:30, 7월 15일 15:00 ~ 15:30)'),
      );
      expect(within(dialog).getByText('한지민').closest('li')).not.toHaveTextContent('고른 시간에 빈 자리 있음');
      expect(detailGetCount).toBe(2);
    } finally {
      releaseRefetch();
    }
  });

  it('배정 검토 중 배정받지 못한 응답자와 남은 자리가 함께 있으면 남은 자리 안내 띠가 보인다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_FREED_SEAT, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');

    expect(
      screen.getByText('응답했으나 배정받지 못한 지원자 2명 · 남은 자리 3개 — 고른 시간이 아닐 수 있습니다'),
    ).toBeInTheDocument();
  });

  it.each([
    { name: '남은 자리 0', detail: DETAIL_ASSIGNING_NO_FREE_SEAT, statusLabel: '배정 검토 중' },
    { name: '배정받지 못한 응답자 0', detail: DETAIL_ASSIGNING_NO_UNASSIGNED_RESPONDED, statusLabel: '배정 검토 중' },
    { name: '응답 수집 중', detail: DETAIL_COLLECTING_WITH_FREE_SEAT, statusLabel: '응답 수집 중' },
  ])('$name 이면 남은 자리 안내 띠가 보이지 않는다', async ({ detail, statusLabel }) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: detail, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText(statusLabel);

    expect(screen.queryByText(/배정받지 못한 지원자/)).not.toBeInTheDocument();
  });

  it.each([
    { unassignedMemberCount: 1, expected: '자동배정이 완료되었습니다 — 응답자 1명은 고른 시간이 모두 차 배정받지 못했습니다.' },
    { unassignedMemberCount: 0, expected: '자동배정이 완료되었습니다.' },
  ])('자동배정을 다시 실행하면 못 받은 인원에 맞춰 완료 메시지 $expected 가 보인다', async ({ unassignedMemberCount, expected }) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_FREED_SEAT, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/auto-assign`, () =>
        HttpResponse.json({ ok: true, data: { assignedMemberCount: 1, unassignedMemberCount }, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(screen.getByRole('button', { name: /자동배정/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /재실행/ }));

    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});

// ── 랜딩 링크 테스트 1건 ────────────────────────────────────────────────────

/** rounds-landing 에서 재사용하는 빈 대기열 핸들러 패턴 */
const EMPTY_CANDIDATES_HANDLER = http.get(
  `*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`,
  () => HttpResponse.json({ ok: true, data: [], message: null }),
);

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
      EMPTY_CANDIDATES_HANDLER,
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
