import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, interviewRoundKeys } from '@duing/hooks';
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

/** 다른 운영진이 오세훈의 결과를 정하기 전(낡은 상세) — 오세훈이 21 을 쥐고 있다 */
const DETAIL_ASSIGNING_HOLDER_PENDING = {
  ...DETAIL_ASSIGNING_FREED_SEAT,
  members: [MEMBER_WANTS_20, MEMBER_HOLDS_21],
  counts: { ...DETAIL_ASSIGNING_FREED_SEAT.counts, totalMemberCount: 2, respondedCount: 2, excludedCount: 0 },
  slots: [FREED_SLOT_20, FULL_SLOT_21, OPEN_SLOT_22],
};
/** 결과가 정해진 뒤(서버 상태) — #1659 로 오세훈은 EXCLUDED, 초안 배정이 지워져 21 이 비었다 */
const DETAIL_ASSIGNING_HOLDER_DECIDED = {
  ...DETAIL_ASSIGNING_HOLDER_PENDING,
  // 결과를 정하면 가능 시간 응답도 soft delete 된다 — 고른 수와 슬롯의 선택 수가 함께 준다.
  members: [MEMBER_WANTS_20, { ...MEMBER_HOLDS_21, status: 'EXCLUDED', selectedSlotCount: 0, assignedSlotId: null }],
  counts: { ...DETAIL_ASSIGNING_HOLDER_PENDING.counts, totalMemberCount: 1, respondedCount: 1, excludedCount: 1 },
  slots: [FREED_SLOT_20, { ...FULL_SLOT_21, selectedCount: 2, assignedCount: 0 }, OPEN_SLOT_22],
};
const MEMBER_ALREADY_EXCLUDED_MESSAGE = '현재 상태에서 허용되지 않는 멤버 상태 변경입니다.';
/** 배정 검토 화면에서 [배정]을 누르기 전에 다른 운영진이 강제 확정했다 — 최유리는 제외, 오세훈은 21 에 배정 */
const DETAIL_HOLDER_PENDING_CONFIRMED = {
  ...DETAIL_ASSIGNING_HOLDER_PENDING,
  status: 'SCHEDULED',
  members: [{ ...MEMBER_WANTS_20, status: 'EXCLUDED' }, { ...MEMBER_HOLDS_21, status: 'ASSIGNED' }],
};
/**
 * 단계는 그대로인데 다른 경로로 다시 받은 상세에서 고른 슬롯 22 가 목록에서 사라진 경우를 흉내 낸다 — 409 는 다시 받기를 일으키는 계기로만 쓴다.
 * (실제 서버에선 나오지 않는 조합: 배정 검토 단계는 슬롯을 지울 수 없고, 확정 단계에서 지워진 슬롯 배정은 400 InvalidSlotSelection 이다.)
 */
const DETAIL_HOLDER_PENDING_SLOT_22_DELETED = {
  ...DETAIL_ASSIGNING_HOLDER_PENDING,
  slots: [FREED_SLOT_20, FULL_SLOT_21],
};
/** 가능없음 멤버(이영희)를 제외한 뒤 — 제외됨은 표로 옮겨 가고 가능없음 섹션은 사라진다 */
const DETAIL_NO_SLOT_MEMBER_EXCLUDED = {
  ...DETAIL_WITH_NO_SLOT_MEMBER,
  counts: { ...DETAIL_WITH_NO_SLOT_MEMBER.counts, noAvailableSlotCount: 0, excludedCount: 1 },
  members: [{ ...DETAIL_WITH_NO_SLOT_MEMBER.members[0]!, status: 'EXCLUDED' }],
};
const STALE_ROUND_MESSAGE = '라운드 단계가 바뀌었습니다. 최신 상태를 확인한 뒤 다시 시도해주세요.';
const SERVER_ERROR_MESSAGE = '서버 오류가 발생했습니다.';

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

  // queryClient 는 표지를 세우지 않는 '관계없는 다시 받기'(invalidateQueries)를 일으키는 데 쓴다.
  return {
    ...render(
      <Wrapper>
        <RoundDashboard clubId={CLUB_ID} recruitmentId={RECRUITMENT_ID} roundId={roundId} />
      </Wrapper>,
    ),
    queryClient,
  };
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
      expect(capturedBody).toMatchObject({ slotId: expect.any(Number), expectedRoundStatus: 'ASSIGNING' });
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
    let cancelUrl = '';

    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_COLLECTING_BEFORE_DEADLINE, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, ({ request }) => {
        cancelCalled = true;
        cancelUrl = request.url;
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
      // 현황의 [라운드 취소]는 진행 중 단계 취소가 의도된 동작이라 기대 단계를 싣지 않는다(키도 없다).
      expect(cancelUrl).toMatch(/\/cancel$/);
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

    // 지금 일정(홍길동 = 슬롯 10)이 아닌 슬롯을 골라 배정 → PUT 요청
    const slotRadios = within(screen.getByRole('dialog')).getAllByRole('radio');
    await userEvent.click(slotRadios[1]!);
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '배정' }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ slotId: expect.any(Number), expectedRoundStatus: 'SCHEDULED' });
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

    // 좁은 폭에서 '남 / 은'·'5 / 명' 처럼 음절 사이에서 끊기지 않게.
    expect(
      screen.getByText('응답했으나 배정받지 못한 지원자 2명 · 남은 자리 3개 — 고른 시간이 아닐 수 있습니다'),
    ).toHaveClass('break-keep');
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

// 행 범위 질의 — 창이 열린 동안 표는 aria-hidden 이라 부재 단언(queryByRole … not)은 재조회와 상관없이 통과한다.
const memberRow = (name: string) => screen.getByText(name).closest<HTMLElement>('div.flex.flex-col');

describe('라운드 현황 — 멤버 동작이 409 로 거절되면 상세 다시 받기', () => {
  it('제외가 409 로 거절되면 창 안 문구가 재조회를 기다리지 않고 뜨고, 다시 받은 상세로 그 멤버 행이 제외됨으로 바뀐다', async () => {
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, async () => {
        detailGetCount += 1;
        if (detailGetCount === 1) {
          return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null });
        }
        await refetchGate;
        return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_DECIDED, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/exclude`, () =>
        HttpResponse.json({ ok: false, data: null, message: MEMBER_ALREADY_EXCLUDED_MESSAGE }, { status: 409 }),
      ),
    );

    try {
      renderDashboard();
      await screen.findByText('배정 검토 중');
      await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '제외' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: '제외하기' }));

      // 재조회를 붙잡은 동안에도 창 안 문구가 먼저 보인다
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(MEMBER_ALREADY_EXCLUDED_MESSAGE);
      expect(detailGetCount).toBe(2);

      releaseRefetch();
      await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
      await waitFor(() => expect(memberRow('오세훈')).toHaveTextContent('제외됨'));
      expect(memberRow('오세훈')).toHaveTextContent('배정 슬롯 —');
      expect(detailGetCount).toBe(2);
    } finally {
      releaseRefetch();
    }
  });
});

describe('라운드 현황 — 수동 배정 실패는 창 안에서 안내', () => {
  it.each<[number, string, number]>([
    [409, '상세를 한 번 더 받는다', 2],
    [500, '상세는 다시 받지 않는다', 1],
  ])('%i 로 거절되면 창을 열어 둔 채 창 안에 문구가 뜨고 %s — 창을 닫으면 문구가 사라진다', async (status, _label, expectedDetailGetCount) => {
    const serverMessage = status === 409 ? MEMBER_ALREADY_EXCLUDED_MESSAGE : SERVER_ERROR_MESSAGE;
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null });
      }),
      http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, () =>
        HttpResponse.json({ ok: false, data: null, message: serverMessage }, { status }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(serverMessage);
    // 창이 열린 동안 본문은 aria-hidden 이라 hidden 까지 세야 페이지 피드백이 없다는 게 보인다.
    expect(screen.getAllByRole('alert', { hidden: true })).toHaveLength(1);
    await waitFor(() => expect(detailGetCount).toBe(expectedDetailGetCount));

    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
    expect(within(await screen.findByRole('dialog')).queryByRole('alert')).not.toBeInTheDocument();
    expect(detailGetCount).toBe(expectedDetailGetCount);
  });

  it('다시 [배정]을 누르면 지난 실패 문구가 지워진다', async () => {
    let releaseRetry: () => void = () => {};
    const retryGate = new Promise<void>((resolve) => {
      releaseRetry = resolve;
    });
    let assignRequestCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null }),
      ),
      http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, async () => {
        assignRequestCount += 1;
        if (assignRequestCount === 1) {
          return HttpResponse.json({ ok: false, data: null, message: SERVER_ERROR_MESSAGE }, { status: 500 });
        }
        await retryGate;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    try {
      renderDashboard();
      await screen.findByText('배정 검토 중');
      await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(SERVER_ERROR_MESSAGE);

      await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));
      // 두 번째 요청을 붙잡은 동안 — 지난 실패 문구가 남아 있지 않다
      await waitFor(() => expect(assignRequestCount).toBe(2));
      expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      releaseRetry();
    }
  });

  it.each([
    { name: '다른 운영진이 먼저 확정했으면 일정 변경 알림 안내가 보이고', refetchedDetail: DETAIL_HOLDER_PENDING_CONFIRMED, showsRescheduleNotice: true },
    { name: '고른 슬롯이 목록에서 사라졌으면', refetchedDetail: DETAIL_HOLDER_PENDING_SLOT_22_DELETED, showsRescheduleNotice: false },
  ])('409 뒤 다시 받은 상세에서 $name 고른 슬롯이 비워져 [배정]이 꺼진다', async ({ refetchedDetail, showsRescheduleNotice }) => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : refetchedDetail;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, () =>
        HttpResponse.json({ ok: false, data: null, message: STALE_ROUND_MESSAGE }, { status: 409 }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
    const dialog = await screen.findByRole('dialog');
    // 슬롯 22(세 번째)를 고른다 — 처음엔 지금 배정된 21 이 골라져 있다
    await userEvent.click(within(dialog).getAllByRole('radio')[2]!);
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(STALE_ROUND_MESSAGE);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled());
    expect(within(dialog).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    if (showsRescheduleNotice) {
      expect(within(dialog).getByText('변경 시 지원자에게 일정 변경 알림이 발송됩니다.')).toBeInTheDocument();
    } else {
      expect(within(dialog).queryByText('변경 시 지원자에게 일정 변경 알림이 발송됩니다.')).not.toBeInTheDocument();
    }
    expect(detailGetCount).toBe(2);
  });

  it('단계가 바뀌어 [배정]이 꺼진 뒤 슬롯을 다시 고르면 켜지고, [배정]을 누를 때의 단계(확정)를 실어 보낸다', async () => {
    let detailGetCount = 0;
    const assignRequestBodies: unknown[] = [];
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : DETAIL_HOLDER_PENDING_CONFIRMED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, async ({ request }) => {
        assignRequestBodies.push(await request.json());
        if (assignRequestBodies.length === 1) {
          return HttpResponse.json({ ok: false, data: null, message: STALE_ROUND_MESSAGE }, { status: 409 });
        }
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('radio')[2]!);
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(STALE_ROUND_MESSAGE);
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled());

    // 확정된 상세에서 다시 고르면 그 선택은 고른 때의 단계(확정)로 기록된다
    await userEvent.click(within(dialog).getAllByRole('radio')[2]!);
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(assignRequestBodies).toEqual([
      { slotId: OPEN_SLOT_22.slotId, expectedRoundStatus: 'ASSIGNING' },
      { slotId: OPEN_SLOT_22.slotId, expectedRoundStatus: 'SCHEDULED' },
    ]);
  });

  it('확정 라운드의 일정 변경이 실패해도 창 안에 문구가 뜬다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null }),
      ),
      http.put(`*/interview-rounds/${ROUND_ID}/members/:memberId/schedule`, () =>
        HttpResponse.json({ ok: false, data: null, message: SERVER_ERROR_MESSAGE }, { status: 500 }),
      ),
    );

    renderDashboard();
    await screen.findByText('확정');
    await userEvent.click(screen.getAllByRole('button', { name: '일정 변경' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('radio')[1]!);
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(SERVER_ERROR_MESSAGE);
    expect(screen.getAllByRole('alert', { hidden: true })).toHaveLength(1);
  });
});

describe('라운드 현황 — 멤버 동작 창이 닫힌 뒤 돌아갈 버튼이 사라지면 그 멤버 행으로 포커스', () => {
  const HOLDER_EXCLUDE_REJECTED = http.post(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/exclude`, () =>
    HttpResponse.json({ ok: false, data: null, message: MEMBER_ALREADY_EXCLUDED_MESSAGE }, { status: 409 }),
  );
  const HOLDER_ASSIGN_REJECTED = http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, () =>
    HttpResponse.json({ ok: false, data: null, message: STALE_ROUND_MESSAGE }, { status: 409 }),
  );

  // 다시 받은 상세가 그려진 뒤 포커스 처리(effect 가 건 setTimeout 0)가 돌 틈 — '그대로 둔다' 단언 앞에 둔다(실측: waitFor 가 끝난 시점엔 아직 안 돌았다).
  const waitForFocusGuardTick = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** 오세훈 제외가 성공하고 그 뒤 상세 다시 받기를 붙잡아 둔다(세 번째 받기부터는 확정된 상세) — 놓아주는 함수를 돌려준다 */
  function serveHolderExcludeSuccessWithHeldRefetch() {
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, async () => {
        detailGetCount += 1;
        if (detailGetCount === 1) {
          return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null });
        }
        if (detailGetCount === 2) {
          await refetchGate;
          return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_DECIDED, message: null });
        }
        return HttpResponse.json({ ok: true, data: { ...DETAIL_ASSIGNING_HOLDER_DECIDED, status: 'SCHEDULED' }, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/exclude`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );
    return () => releaseRefetch();
  }

  /** 오세훈 행의 [제외] → [제외하기] 뒤 창이 닫히고 포커스가 [제외] 버튼으로 돌아올 때까지 */
  async function excludeHolderAndWaitForClose() {
    const { queryClient } = renderDashboard();
    await screen.findByText('배정 검토 중');
    const excludeButton = within(memberRow('오세훈')!).getByRole('button', { name: '제외' });
    await userEvent.click(excludeButton);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '제외하기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // 다시 받기를 붙잡은 동안엔 버튼이 남아 있어 공용 복귀대로 그 버튼으로 돌아간다
    await waitFor(() => expect(excludeButton).toHaveFocus());
    await waitForFocusGuardTick();
    expect(excludeButton).toHaveFocus();
    return queryClient;
  }

  it.each([
    { name: '제외가 409 로 거절돼 그 멤버가 제외된 상세', actionLabel: '제외', confirmLabel: '제외하기', rejection: HOLDER_EXCLUDE_REJECTED, refetchedDetail: DETAIL_ASSIGNING_HOLDER_DECIDED, isAssignDialog: false },
    { name: '수동 배정이 409 로 거절돼 그 멤버가 제외된 상세', actionLabel: '수동 배정', confirmLabel: '배정', rejection: HOLDER_ASSIGN_REJECTED, refetchedDetail: DETAIL_ASSIGNING_HOLDER_DECIDED, isAssignDialog: true },
    { name: '수동 배정이 409 로 거절돼 확정으로 바뀐 상세([수동 배정]이 [일정 변경]으로)', actionLabel: '수동 배정', confirmLabel: '배정', rejection: HOLDER_ASSIGN_REJECTED, refetchedDetail: DETAIL_HOLDER_PENDING_CONFIRMED, isAssignDialog: true },
  ])('$name 를 창이 열린 동안 받고 [취소]로 닫으면 그 멤버 행으로 간다', async ({ actionLabel, confirmLabel, rejection, refetchedDetail, isAssignDialog }) => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : refetchedDetail;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      rejection,
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: actionLabel }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: confirmLabel }));
    await within(dialog).findByRole('alert');
    // 창이 닫히기 전에 다시 받은 상세가 그려져 돌아갈 버튼이 이미 없다(창이 열린 동안 표는 aria-hidden 이라 hidden 으로 본다)
    await waitFor(() =>
      expect(within(memberRow('오세훈')!).queryByRole('button', { name: actionLabel, hidden: true })).not.toBeInTheDocument(),
    );
    if (isAssignDialog) {
      // 손대지 않고 보낸 선택은 다시 받은 상세에서 지금 일정이 없어졌거나(제외) 단계가 바뀌었으면(확정) 비워져 다시 보낼 수 없다.
      expect(within(dialog).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();
    }

    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.getByRole('group', { name: /^오세훈 / })).toHaveFocus());
    expect(detailGetCount).toBe(2);
  });

  it('제외가 성공하면 다시 받는 동안엔 [제외] 버튼에 남고, 다시 받아 버튼이 사라지면 그 멤버 행으로 간다 — 그 뒤의 관계없는 다시 받기는 끌어오지 않는다', async () => {
    const releaseRefetch = serveHolderExcludeSuccessWithHeldRefetch();
    try {
      const queryClient = await excludeHolderAndWaitForClose();

      releaseRefetch();
      const holderRow = screen.getByRole('group', { name: /^오세훈 / });
      await waitFor(() => expect(holderRow).toHaveFocus());

      // 표지는 그 갱신 한 번으로 지워진다 — 포커스가 빠진 채 관계없는 다시 받기가 와도 행으로 끌려가지 않는다.
      // 계기는 표지를 세우지 않는 갱신이어야 한다(확정 성공은 배너 표지를 세워 이 가드를 가린다).
      holderRow.blur();
      await queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(ROUND_ID) });
      await waitFor(() => expect(screen.queryByText('배정 검토 중')).not.toBeInTheDocument());
      await waitForFocusGuardTick();
      expect(document.body).toHaveFocus();
    } finally {
      releaseRefetch();
    }
  });

  it('닫힌 뒤 사용자가 옮긴 포커스는 다시 받은 상세로 버튼이 사라져도 그대로 둔다', async () => {
    const releaseRefetch = serveHolderExcludeSuccessWithHeldRefetch();
    try {
      await excludeHolderAndWaitForClose();
      const cancelRoundButton = screen.getByRole('button', { name: '라운드 취소' });
      cancelRoundButton.focus();

      releaseRefetch();
      await waitFor(() => expect(memberRow('오세훈')).toHaveTextContent('제외됨'));
      await waitForFocusGuardTick();
      expect(cancelRoundButton).toHaveFocus();
    } finally {
      releaseRefetch();
    }
  });

  it('다시 받기를 기다리는 동안 다른 창(라운드 취소)을 열었다 닫으면 표지가 지워져, 붙잡아 둔 다시 받기로 버튼이 사라져도 멤버 행에 끌려가지 않는다', async () => {
    const releaseRefetch = serveHolderExcludeSuccessWithHeldRefetch();
    try {
      // 다시 받기를 붙잡아 표지가 남아 있다
      await excludeHolderAndWaitForClose();

      // 멤버 창이 아닌 창을 열었다 그냥 닫는다 — 열 때 표지가 지워지고, 닫힘은 표지를 세우지 않는다
      const cancelRoundButton = screen.getByRole('button', { name: '라운드 취소' });
      await userEvent.click(cancelRoundButton);
      await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));
      await waitFor(() => expect(cancelRoundButton).toHaveFocus());
      cancelRoundButton.blur();

      // 붙잡아 둔 다시 받기가 오세훈의 [제외]를 없앤다 — 표지가 남았다면 여기서 행으로 끌려간다
      releaseRefetch();
      await waitFor(() => expect(memberRow('오세훈')).toHaveTextContent('제외됨'));
      await waitForFocusGuardTick();
      expect(document.body).toHaveFocus();
    } finally {
      releaseRefetch();
    }
  });

  it('그냥 [취소]로 닫으면 표지가 남지 않아, 나중의 관계없는 다시 받기가 멤버 행으로 끌어오지 않는다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : { ...DETAIL_ASSIGNING_HOLDER_PENDING, status: 'SCHEDULED' };
        return HttpResponse.json({ ok: true, data, message: null });
      }),
    );

    const { queryClient } = renderDashboard();
    await screen.findByText('배정 검토 중');
    const excludeButton = within(memberRow('오세훈')!).getByRole('button', { name: '제외' });
    await userEvent.click(excludeButton);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(excludeButton).toHaveFocus());
    await waitForFocusGuardTick();

    // 포커스가 빠진 채 관계없는 다시 받기(표지를 세우지 않는 갱신)가 와도 멤버 행으로 끌려가지 않는다
    excludeButton.blur();
    await queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(ROUND_ID) });
    await waitFor(() => expect(screen.queryByText('배정 검토 중')).not.toBeInTheDocument());
    await waitForFocusGuardTick();
    expect(document.body).toHaveFocus();
    expect(detailGetCount).toBe(2);
  });

  it('가능없음 섹션의 멤버를 제외하면 표로 옮겨 간 그 멤버 행으로 간다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_WITH_NO_SLOT_MEMBER : DETAIL_NO_SLOT_MEMBER_EXCLUDED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/members/3/exclude`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('응답 수집 중');
    const noSlotRow = screen.getByRole('group', { name: /^이영희 / });
    await userEvent.click(within(noSlotRow).getByRole('button', { name: '제외' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '제외하기' }));

    await waitFor(() => expect(screen.queryByText(/가능한 시간이 없는 지원자/)).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('group', { name: /^이영희 / })).toHaveFocus());
    expect(screen.getByRole('group', { name: /^이영희 / })).not.toBe(noSlotRow);
  });

  it('제외를 [취소]하면(멤버 그대로) [제외] 버튼으로 돌아간다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    const excludeButton = within(memberRow('오세훈')!).getByRole('button', { name: '제외' });
    await userEvent.click(excludeButton);
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '취소' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(excludeButton).toHaveFocus());
    await waitForFocusGuardTick();
    expect(excludeButton).toHaveFocus();
  });

  it('수동 배정이 성공하면(버튼이 남는다) [수동 배정] 버튼에 남는다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data =
          detailGetCount === 1
            ? DETAIL_ASSIGNING_HOLDER_PENDING
            : { ...DETAIL_ASSIGNING_HOLDER_PENDING, members: [MEMBER_WANTS_20, { ...MEMBER_HOLDS_21, assignedSlotId: OPEN_SLOT_22.slotId }] };
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    const assignButton = within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' });
    await userEvent.click(assignButton);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('radio')[2]!);
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

    await waitFor(() => expect(memberRow('오세훈')).toHaveTextContent('배정 슬롯 7월 15일 15:00 ~ 15:30'));
    await waitForFocusGuardTick();
    expect(assignButton).toHaveFocus();
  });
});

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

describe('라운드 현황 다듬기 — 창·레이아웃', () => {
  it('수동 배정 창은 슬롯 목록만 스크롤하고, 제목·확정 안내·실패 문구·버튼은 스크롤 밖에 둔다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null }),
      ),
      http.put(`*/interview-rounds/${ROUND_ID}/members/:memberId/schedule`, () =>
        HttpResponse.json({ ok: false, data: null, message: SERVER_ERROR_MESSAGE }, { status: 500 }),
      ),
    );

    renderDashboard();
    await screen.findByText('확정');
    await userEvent.click(screen.getAllByRole('button', { name: '일정 변경' })[0]!);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('radio')[1]!);
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));
    const alert = await within(dialog).findByRole('alert');

    // 슬롯이 많으면 창이 화면을 넘는다 — 창 높이에 상한을 두고 목록만 스크롤한다.
    expect(dialog).toHaveClass('max-h-[calc(100dvh-4rem)]', 'flex', 'flex-col');
    const scrollArea = within(dialog).getAllByRole('radio')[0]!.closest('.overflow-y-auto');
    expect(scrollArea).not.toBeNull();
    expect(scrollArea).toHaveClass('min-h-0');
    expect(scrollArea).not.toContainElement(alert);
    expect(scrollArea).not.toContainElement(within(dialog).getByRole('button', { name: '배정' }));
    expect(scrollArea).not.toContainElement(within(dialog).getByRole('button', { name: '취소' }));
    expect(scrollArea).not.toContainElement(within(dialog).getByText('변경 시 지원자에게 일정 변경 알림이 발송됩니다.'));
    expect(scrollArea).not.toContainElement(within(dialog).getByRole('heading'));
  });

  it('배정 검토 draft 띠의 글은 어절 단위로 접히고, 칩은 줄어들지 않는다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');

    // 좁은 폭에서 '않습니 / 다' 처럼 음절 사이에서 끊기지 않게 — 글만 따로 접고 칩은 첫 줄에 붙인다.
    const draftNotice = screen.getByText('확정 전까지 지원자에게 통지되지 않습니다');
    expect(draftNotice).toHaveClass('break-keep');
    expect(screen.getByText('draft')).toHaveClass('shrink-0');
    expect(draftNotice.parentElement).toHaveClass('items-start');
  });

  it('확정 409 창의 사람 줄은 이름을 쪼개지 않고, 한 줄에 안 들어가면 오른쪽 문구를 이름 아래로 내린다', async () => {
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

    const nameCell = within(dialog).getByText('최유리');
    // 이름 칸 40% 상한은 320 폭에서 8자 이름을 '7자 / 1자' 로 쪼갰다 — 상한 대신 줄을 접는다(오른쪽은 시간 한 덩어리 폭 8rem 아래로 줄지 않는다).
    expect(nameCell.closest('li')).toHaveClass('flex-wrap');
    expect(nameCell).not.toHaveClass('max-w-[40%]');
    expect(nameCell).not.toHaveClass('shrink-0');
    expect(nameCell.nextElementSibling).toHaveClass('grow', 'basis-32');
  });
});

/** 배정 검토 화면에서 [배정]을 누르기 전에 다른 운영진이 확정하면서 오세훈을 22 로 옮겼다 — 창이 연 때의 사본(21)이 아니라 이 상세를 봐야 한다 */
const DETAIL_HOLDER_MOVED_TO_22_CONFIRMED = {
  ...DETAIL_ASSIGNING_HOLDER_PENDING,
  status: 'SCHEDULED',
  members: [{ ...MEMBER_WANTS_20, status: 'EXCLUDED' }, { ...MEMBER_HOLDS_21, status: 'ASSIGNED', assignedSlotId: OPEN_SLOT_22.slotId }],
};
/** 확정 단계에서 다른 운영진이 슬롯 11 을 지운 뒤 — 배정은 400 InvalidSlotSelection */
const DETAIL_SCHEDULED_SLOT_B_DELETED = { ...DETAIL_SCHEDULED, slots: [SLOT_A] };
const INVALID_SLOT_MESSAGE = '선택한 슬롯이 유효하지 않습니다.';
const RESCHEDULED_FEEDBACK = '홍길동 님의 면접 일정이 변경되었습니다. 지원자에게 일정 변경 알림이 발송됩니다.';
const roundBanner = (name: string) => screen.getByRole('group', { name });

describe('라운드 현황 다듬기 — 일정 변경 문맥', () => {
  it('확정 라운드의 일정 변경 창은 제목이 일정 변경이고, 지금 일정이 골라진 채로는 [배정]이 꺼진다 — 다른 슬롯을 고르면 켜지고, 성공하면 알림 안내가 뜬다', async () => {
    let releaseAssign: () => void = () => {};
    const assignGate = new Promise<void>((resolve) => {
      releaseAssign = resolve;
    });
    const assignRequestBodies: unknown[] = [];
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null }),
      ),
      http.put(`*/interview-rounds/${ROUND_ID}/members/1/schedule`, async ({ request }) => {
        assignRequestBodies.push(await request.json());
        await assignGate;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    try {
      renderDashboard();
      await screen.findByText('확정');
      await userEvent.click(within(memberRow('홍길동')!).getByRole('button', { name: '일정 변경' }));
      const dialog = await screen.findByRole('dialog');

      expect(within(dialog).getByRole('heading', { name: '홍길동 일정 변경' })).toBeInTheDocument();
      const [currentSlotRadio, otherSlotRadio] = within(dialog).getAllByRole('radio');
      // 같은 슬롯은 서버가 바꾸지 않는다(204, #1702) — 지금 일정 그대로면 보낼 것이 없어 끈다.
      expect(currentSlotRadio).toBeChecked();
      expect(currentSlotRadio!.closest('label')).toHaveTextContent('· 지금 일정');
      expect(otherSlotRadio!.closest('label')).not.toHaveTextContent('지금 일정');
      expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();

      await userEvent.click(otherSlotRadio!);
      expect(within(dialog).getByRole('button', { name: '배정' })).toBeEnabled();
      await userEvent.click(currentSlotRadio!);
      expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();
      await userEvent.click(otherSlotRadio!);
      await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

      // 요청을 붙잡은 동안 — 진행 문구도 일정 변경 문맥
      await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('일정 변경 중'));
    } finally {
      releaseAssign();
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText(RESCHEDULED_FEEDBACK)).toBeInTheDocument();
    expect(assignRequestBodies).toEqual([{ slotId: SLOT_B.slotId, expectedRoundStatus: 'SCHEDULED' }]);
  });

  it('배정 검토 단계의 창은 제목이 수동 배정이고 지금 일정 표지가 없으며, 성공 문구는 슬롯 배정 안내다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null }),
      ),
      http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('heading', { name: '오세훈 수동 배정' })).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('지금 일정');
    // 배정 검토의 같은 슬롯 재배정은 알림이 없는 무해한 동작이라 막지 않는다.
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeEnabled();
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

    expect(await screen.findByText('오세훈 님에게 슬롯이 배정되었습니다.')).toBeInTheDocument();
  });

  it('409 뒤 다시 받은 확정 상세에서 그 멤버가 다른 슬롯으로 옮겨졌으면, 창은 다시 받은 지금 일정을 기준으로 [배정]을 끈다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : DETAIL_HOLDER_MOVED_TO_22_CONFIRMED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.put(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/schedule`, () =>
        HttpResponse.json({ ok: false, data: null, message: STALE_ROUND_MESSAGE }, { status: 409 }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('radio')[2]!);
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(STALE_ROUND_MESSAGE);

    // 확정 상세로 다시 그려진다 — 제목이 바뀌고, 지금 일정 표지는 연 때의 21 이 아니라 다시 받은 22 에 붙는다
    expect(await within(dialog).findByRole('heading', { name: '오세훈 일정 변경' })).toBeInTheDocument();
    const [, slot21Radio, slot22Radio] = within(dialog).getAllByRole('radio');
    expect(slot22Radio!.closest('label')).toHaveTextContent('· 지금 일정');
    expect(slot21Radio!.closest('label')).not.toHaveTextContent('지금 일정');

    await userEvent.click(slot22Radio!);
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();
    await userEvent.click(slot21Radio!);
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeEnabled();
    expect(detailGetCount).toBe(2);
  });

  it('확정 단계에서 그사이 지워진 슬롯으로 배정하면(400) 창 안에 서버 문구가 뜨고 상세를 다시 받아, 사라진 슬롯의 선택이 풀린다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        // 1 = 처음, 2 = [일정 변경]을 열 때 다시 받기 — 슬롯은 배정 요청이 거절된 뒤(3)에야 지워진 것으로 받는다.
        const data = detailGetCount <= 2 ? DETAIL_SCHEDULED : DETAIL_SCHEDULED_SLOT_B_DELETED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.put(`*/interview-rounds/${ROUND_ID}/members/1/schedule`, () =>
        HttpResponse.json({ ok: false, data: null, message: INVALID_SLOT_MESSAGE }, { status: 400 }),
      ),
    );

    const { queryClient } = renderDashboard();
    await screen.findByText('확정');
    await userEvent.click(within(memberRow('홍길동')!).getByRole('button', { name: '일정 변경' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(detailGetCount).toBe(2));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: interviewRoundKeys.detail(ROUND_ID) })).toBe(0));
    await userEvent.click(within(dialog).getAllByRole('radio')[1]!);
    await userEvent.click(within(dialog).getByRole('button', { name: '배정' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(INVALID_SLOT_MESSAGE);
    await waitFor(() => expect(within(dialog).getAllByRole('radio')).toHaveLength(1));
    expect(within(dialog).queryByRole('radio', { checked: true })).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();
    expect(detailGetCount).toBe(3);
  });

  it('멤버를 제외하면 조사 없이 "OOO 님이 제외되었습니다." 로 알린다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : DETAIL_ASSIGNING_HOLDER_DECIDED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/exclude`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '제외' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '제외하기' }));

    // 창이 닫힌 뒤 페이지 상태 리전으로 읽힌다(창이 열린 동안 본문은 aria-hidden).
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('오세훈 님이 제외되었습니다.');
    expect(screen.queryByText(/\(가\)/)).not.toBeInTheDocument();
  });
});

describe('라운드 현황 다듬기 — 확정 성공 뒤 상태 배너로 포커스', () => {
  const waitForFocusGuardTick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const SCHEDULED_AFTER_CONFIRM = { ...DETAIL_ASSIGNING_HOLDER_PENDING, status: 'SCHEDULED' };

  // userEvent 는 [확정]에 포커스를 주고, fireEvent 는 주지 않는다(클릭이 버튼에 포커스를 주지 않는 Safari 경로) — 둘 다 body 로 빠진 뒤 배너로 간다.
  it.each([
    { clickPath: 'userEvent(버튼에 포커스)', clickConfirm: (button: HTMLElement) => userEvent.click(button) },
    { clickPath: 'fireEvent(포커스 없음 — Safari)', clickConfirm: (button: HTMLElement) => fireEvent.click(button) },
  ])('[확정]이 성공해 버튼이 사라지면 포커스가 상태 배너(단계·제목으로 읽힘)로 간다 — $clickPath', async ({ clickConfirm }) => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : SCHEDULED_AFTER_CONFIRM;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, () =>
        HttpResponse.json({ ok: true, data: { assignedMemberCount: 1, excludedMemberCount: 0 }, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    expect(roundBanner('배정 검토 중 1차 면접')).toHaveAttribute('tabindex', '-1');
    await clickConfirm(screen.getByRole('button', { name: /^확정$/ }));

    await waitFor(() => expect(roundBanner('확정 1차 면접')).toHaveFocus());
    expect(screen.queryByRole('button', { name: /^확정$/ })).not.toBeInTheDocument();
  });

  it('강제 확정이 성공해 창이 닫히고 [확정]이 사라지면 상태 배너로 간다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount <= 2 ? DETAIL_ASSIGNING_FREED_SEAT : { ...DETAIL_ASSIGNING_FREED_SEAT, status: 'SCHEDULED' };
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, ({ request }) =>
        new URL(request.url).searchParams.get('force') === 'true'
          ? HttpResponse.json({ ok: true, data: { assignedMemberCount: 1, excludedMemberCount: 2 }, message: null })
          : HttpResponse.json({ ok: false, data: FREED_SEAT_UNRESOLVED_PAYLOAD, message: '미처리 멤버가 있습니다.' }, { status: 409 }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(screen.getByRole('button', { name: /^확정$/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /강제 확정/ }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(roundBanner('확정 1차 면접')).toHaveFocus());
  });

  it('확정 성공 뒤 다시 받기를 붙잡은 동안 사용자가 옮긴 포커스는 다시 받은 상세로 [확정]이 사라져도 그대로 둔다', async () => {
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, async () => {
        detailGetCount += 1;
        if (detailGetCount === 1) return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null });
        await refetchGate;
        return HttpResponse.json({ ok: true, data: SCHEDULED_AFTER_CONFIRM, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, () =>
        HttpResponse.json({ ok: true, data: { assignedMemberCount: 1, excludedMemberCount: 0 }, message: null }),
      ),
    );

    try {
      renderDashboard();
      await screen.findByText('배정 검토 중');
      await userEvent.click(screen.getByRole('button', { name: /^확정$/ }));
      await screen.findByText('확정 완료 — 1명 알림');

      const backLink = screen.getByRole('link', { name: '면접 관리로 돌아가기' });
      backLink.focus();
      releaseRefetch();
      await waitFor(() => expect(screen.queryByText('배정 검토 중')).not.toBeInTheDocument());
      await waitForFocusGuardTick();
      expect(backLink).toHaveFocus();
    } finally {
      releaseRefetch();
    }
  });

  it('확정이 실패하면(500) 표지를 세우지 않는다 — 그 뒤 포커스가 빠진 채 오는 관계없는 다시 받기가 배너로 끌어오지 않는다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : SCHEDULED_AFTER_CONFIRM;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, () =>
        HttpResponse.json({ ok: false, data: null, message: SERVER_ERROR_MESSAGE }, { status: 500 }),
      ),
    );

    const { queryClient } = renderDashboard();
    await screen.findByText('배정 검토 중');
    const confirmButton = screen.getByRole('button', { name: /^확정$/ });
    await userEvent.click(confirmButton);
    expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_ERROR_MESSAGE);

    confirmButton.blur();
    await queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(ROUND_ID) });
    await waitFor(() => expect(screen.queryByText('배정 검토 중')).not.toBeInTheDocument());
    await waitForFocusGuardTick();
    expect(document.body).toHaveFocus();
  });
});

describe('라운드 현황 다듬기 — 초안 배너', () => {
  const DETAIL_DRAFT = {
    ...DETAIL_COLLECTING_BEFORE_DEADLINE,
    status: 'DRAFT',
    availabilityDeadline: null,
    requestSequence: 0,
  };
  /** 인원 0 초안 — 전원 결과 확정·제외로 비EXCLUDED 0 명 */
  const DETAIL_EMPTY_DRAFT = {
    ...DETAIL_DRAFT,
    counts: { ...DETAIL_DRAFT.counts, totalMemberCount: 0, invitedCount: 0, respondedCount: 0, excludedCount: 2, unrespondedCount: 0 },
    members: DETAIL_DRAFT.members.map((member) => ({ ...member, status: 'EXCLUDED', unresponded: false })),
  };
  const WIZARD_HREF = `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/interview/rounds/new`;

  it.each([
    { name: '인원 0 초안은 정리하기', detail: DETAIL_EMPTY_DRAFT, linkName: '정리하기', otherLinkName: '이어서 작성' },
    { name: '인원 있는 초안은 이어서 작성', detail: DETAIL_DRAFT, linkName: '이어서 작성', otherLinkName: '정리하기' },
  ])('$name 링크로 마법사에 간다', async ({ detail, linkName, otherLinkName }) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => HttpResponse.json({ ok: true, data: detail, message: null })),
    );

    renderDashboard();
    await screen.findByText('작성 중');

    expect(screen.getByRole('link', { name: linkName })).toHaveAttribute('href', WIZARD_HREF);
    expect(screen.queryByRole('link', { name: otherLinkName })).not.toBeInTheDocument();
  });
});

describe('라운드 현황 다듬기 — 결과를 정한 제외 멤버', () => {
  const resultMember = (memberId: number, userName: string, status: string, applicationResult?: string | null) => ({
    memberId, applicationId: memberId, userName, studentId: `2024${memberId}`, status, unresponded: false,
    alternativeAvailabilityText: null, selectedSlotCount: 0, assignedSlotId: status === 'ASSIGNED' ? SLOT_A.slotId : null,
    ...(applicationResult === undefined ? {} : { applicationResult }),
  });
  /** 백엔드 스펙 기준 applicationResult — 멤버 상태와 독립이라 여러 조합이 온다 */
  const DETAIL_SCHEDULED_WITH_RESULTS = {
    ...DETAIL_SCHEDULED,
    members: [
      resultMember(201, '강합격', 'EXCLUDED', 'ACCEPTED'),
      resultMember(202, '노불합', 'EXCLUDED', 'REJECTED'),
      resultMember(203, '도제외', 'EXCLUDED', null),
      resultMember(204, '류옛날', 'EXCLUDED'),
      resultMember(205, '문확정', 'ASSIGNED', 'ACCEPTED'),
      resultMember(206, '박이상', 'EXCLUDED', 'INTERVIEW_PENDING'),
    ],
  };
  const DETAIL_ASSIGNING_WITH_BULK_REJECTED = {
    ...DETAIL_ASSIGNING,
    members: [resultMember(207, '서일괄', 'RESPONDED', 'REJECTED')],
  };

  it.each([
    { name: '강합격', label: '합격', badgeClass: 'bg-sage/10 text-sage-deep', why: 'EXCLUDED + 합격 → 합격(긍정)' },
    { name: '노불합', label: '불합격', badgeClass: 'bg-paper text-charcoal-2 ring-1 ring-inset ring-line', why: 'EXCLUDED + 불합격 → 불합격(중립·종료)' },
    { name: '도제외', label: '제외됨', badgeClass: 'bg-coral/10 text-coral-deep', why: 'EXCLUDED + 결과 없음 → 제외됨' },
    { name: '류옛날', label: '제외됨', badgeClass: 'bg-coral/10 text-coral-deep', why: '옛 백엔드(필드 없음) → 제외됨' },
    { name: '문확정', label: '배정됨', badgeClass: 'bg-sky/10 text-sky-deep', why: '확정 라운드 ASSIGNED + 결과 → 배정됨(일정이 이 표의 정보)' },
    { name: '박이상', label: '제외됨', badgeClass: 'bg-coral/10 text-coral-deep', why: '알려지지 않은 결과 값 → 제외됨(아는 값만)' },
  ])('$why', async ({ name, label, badgeClass }) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED_WITH_RESULTS, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText(name);

    const badge = within(memberRow(name)!).getByText(label);
    expect(badge).toHaveClass(...badgeClass.split(' '));
  });

  it('진행 중 라운드의 응답 완료 멤버에 일괄 불합격이 실려도 지금 상태 그대로다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_WITH_BULK_REJECTED, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('서일괄');

    expect(within(memberRow('서일괄')!).getByText('응답 완료')).toBeInTheDocument();
    expect(within(memberRow('서일괄')!).queryByText('불합격')).not.toBeInTheDocument();
  });
});

describe('라운드 현황 다듬기 — 포커스 스크롤 분기', () => {
  /** HTMLElement.focus 를 감싸 어느 요소가 어떤 옵션으로 포커스를 받았는지 모은다 — 실제 포커스는 그대로 옮긴다 */
  function recordFocusCalls() {
    const focusCalls: Array<{ element: HTMLElement; options: FocusOptions | undefined }> = [];
    const originalFocus = HTMLElement.prototype.focus;
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
      focusCalls.push({ element: this, options });
      originalFocus.call(this, options);
    });
    return { focusCalls, restore: () => focusSpy.mockRestore() };
  }

  it('멤버 행은 화면이 튀지 않게 스크롤 없이(preventScroll: true) 포커스를 받는다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : DETAIL_ASSIGNING_HOLDER_DECIDED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/members/${MEMBER_HOLDS_21.memberId}/exclude`, () =>
        HttpResponse.json({ ok: false, data: null, message: MEMBER_ALREADY_EXCLUDED_MESSAGE }, { status: 409 }),
      ),
    );
    const { focusCalls, restore } = recordFocusCalls();
    try {
      renderDashboard();
      await screen.findByText('배정 검토 중');
      await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '제외' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: '제외하기' }));
      await within(dialog).findByRole('alert');
      await waitFor(() =>
        expect(within(memberRow('오세훈')!).queryByRole('button', { name: '제외', hidden: true })).not.toBeInTheDocument(),
      );
      await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));

      const holderRow = screen.getByRole('group', { name: /^오세훈 / });
      await waitFor(() => expect(holderRow).toHaveFocus());
      expect(focusCalls.filter((focusCall) => focusCall.element === holderRow).map((focusCall) => focusCall.options)).toEqual([
        { preventScroll: true },
      ]);
    } finally {
      restore();
    }
  });

  it('상태 배너는 [확정]을 누른 뒤 스크롤해 화면 밖이면 보이게(preventScroll: false) 포커스를 받는다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_ASSIGNING_HOLDER_PENDING : { ...DETAIL_ASSIGNING_HOLDER_PENDING, status: 'SCHEDULED' };
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, () =>
        HttpResponse.json({ ok: true, data: { assignedMemberCount: 1, excludedMemberCount: 0 }, message: null }),
      ),
    );
    const { focusCalls, restore } = recordFocusCalls();
    try {
      renderDashboard();
      await screen.findByText('배정 검토 중');
      await userEvent.click(screen.getByRole('button', { name: /^확정$/ }));

      const banner = await screen.findByRole('group', { name: '확정 1차 면접' });
      await waitFor(() => expect(banner).toHaveFocus());
      expect(focusCalls.filter((focusCall) => focusCall.element === banner).map((focusCall) => focusCall.options)).toEqual([
        { preventScroll: false },
      ]);
    } finally {
      restore();
    }
  });
});

describe('라운드 현황 다듬기 — 일정 변경 창이 열린 동안 다른 탭이 그 멤버 일정을 옮김', () => {
  /** 처음엔 오세훈이 21 에 확정 배정(창을 열 때 다시 받아도 21), 그 다음 다시 받으면 다른 탭이 22 로 옮긴 상세 */
  function serveHolderMovedTo22OnRefetch() {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount <= 2 ? DETAIL_HOLDER_PENDING_CONFIRMED : DETAIL_HOLDER_MOVED_TO_22_CONFIRMED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
    );
    return () => detailGetCount;
  }

  async function openHolderReschedule(detailGetCount: () => number) {
    const { queryClient } = renderDashboard();
    await screen.findByText('확정');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '일정 변경' }));
    const dialog = await screen.findByRole('dialog');
    // 열 때 다시 받기(GET 2)가 끝난 뒤 조작한다.
    await waitFor(() => expect(detailGetCount()).toBe(2));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: interviewRoundKeys.detail(ROUND_ID) })).toBe(0));
    const [slot20Radio, slot21Radio, slot22Radio] = within(dialog).getAllByRole('radio');
    return { queryClient, dialog, slot20Radio: slot20Radio!, slot21Radio: slot21Radio!, slot22Radio: slot22Radio! };
  }

  it('아무것도 고르지 않았으면 선택이 다시 받은 지금 일정(22)을 따라 [배정]이 꺼진 채다 — 낡은 21 로 되돌리지 않는다', async () => {
    const detailGetCount = serveHolderMovedTo22OnRefetch();
    const { queryClient, dialog, slot21Radio, slot22Radio } = await openHolderReschedule(detailGetCount);
    expect(slot21Radio).toBeChecked();

    await queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(ROUND_ID) });

    // 옛 슬롯(21)이 골라진 채 [배정]이 켜지면, 누르는 순간 지원자를 옛 일정으로 되돌리고 변경 알림까지 보낸다.
    await waitFor(() => expect(slot22Radio.closest('label')).toHaveTextContent('· 지금 일정'));
    expect(slot21Radio.closest('label')).not.toHaveTextContent('지금 일정');
    expect(slot22Radio).toBeChecked();
    expect(slot21Radio).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();
    expect(detailGetCount()).toBe(3);
  });

  it('다른 슬롯(20)을 골랐다가 지금 일정(21)을 다시 고르면 손대지 않은 것으로 돌아가, 다시 받은 지금 일정(22)을 따른다', async () => {
    const detailGetCount = serveHolderMovedTo22OnRefetch();
    const { queryClient, dialog, slot20Radio, slot21Radio, slot22Radio } = await openHolderReschedule(detailGetCount);
    await userEvent.click(slot20Radio);
    await userEvent.click(slot21Radio);
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();

    await queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(ROUND_ID) });

    // 21 로 고정되면 다시 받은 뒤 21 이 골라진 채 [배정]이 켜져, 지원자를 옛 일정으로 되돌린다.
    await waitFor(() => expect(slot22Radio.closest('label')).toHaveTextContent('· 지금 일정'));
    expect(slot22Radio).toBeChecked();
    expect(slot21Radio).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();
  });

  it('먼저 다른 슬롯(20)을 골랐으면 다시 받아도 그 선택이 남는다', async () => {
    const detailGetCount = serveHolderMovedTo22OnRefetch();
    const { queryClient, dialog, slot20Radio, slot22Radio } = await openHolderReschedule(detailGetCount);
    await userEvent.click(slot20Radio);

    await queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(ROUND_ID) });

    await waitFor(() => expect(slot22Radio.closest('label')).toHaveTextContent('· 지금 일정'));
    expect(slot20Radio).toBeChecked();
    expect(slot22Radio).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeEnabled();
  });
});

describe('라운드 현황 후속 — 결과를 정한 멤버의 배정 동작', () => {
  const decidedMember = (memberId: number, userName: string, status: string, applicationResult?: string | null) => ({
    memberId, applicationId: memberId, userName, studentId: `2025${memberId}`, status, unresponded: false,
    alternativeAvailabilityText: null, selectedSlotCount: 1, assignedSlotId: status === 'ASSIGNED' ? SLOT_A.slotId : null,
    ...(applicationResult === undefined ? {} : { applicationResult }),
  });
  /** 표·가능없음 섹션의 행은 모두 이름 + 학번으로 읽히는 group 이다(표의 memberRow 는 가능없음 행을 찾지 못한다) */
  const findMemberGroup = (name: string) => screen.findByRole('group', { name: new RegExp(`^${name} `) });

  const DETAIL_SCHEDULED_WITH_DECIDED_ASSIGNED = {
    ...DETAIL_SCHEDULED,
    members: [
      decidedMember(301, '가합격', 'ASSIGNED', 'ACCEPTED'),
      decidedMember(302, '나불합', 'ASSIGNED', 'REJECTED'),
      decidedMember(303, '다미정', 'ASSIGNED', null),
      decidedMember(304, '라옛날', 'ASSIGNED'),
      decidedMember(305, '마이상', 'ASSIGNED', 'INTERVIEW_PENDING'),
    ],
  };
  /** #1659 이전에 결과를 정해 남은 멤버·총동연 일괄 불합격 — 제외되지 않은 채 결과가 실린다 */
  const DETAIL_ASSIGNING_WITH_DECIDED_REMAINING = {
    ...DETAIL_ASSIGNING,
    counts: { ...DETAIL_ASSIGNING.counts, noAvailableSlotCount: 2 },
    members: [
      decidedMember(311, '바일괄', 'RESPONDED', 'REJECTED'),
      decidedMember(312, '사이전', 'ASSIGNED', 'ACCEPTED'),
      decidedMember(313, '아미정', 'RESPONDED', null),
      decidedMember(314, '자가능', 'NO_AVAILABLE_SLOT', 'REJECTED'),
      decidedMember(315, '차가능', 'NO_AVAILABLE_SLOT', null),
    ],
  };

  it.each(['가합격', '나불합'])('확정 라운드에서 결과가 정해진 배정 멤버(%s)는 [일정 변경] 대신 이유를 보인다 — 배지는 배정됨 그대로', async (name) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED_WITH_DECIDED_ASSIGNED, message: null }),
      ),
    );

    renderDashboard();
    const row = await findMemberGroup(name);

    expect(within(row).queryByRole('button', { name: '일정 변경' })).not.toBeInTheDocument();
    expect(within(row).getByText('결과 확정 — 일정 변경 불가')).toBeInTheDocument();
    expect(within(row).getByText('배정됨')).toBeInTheDocument();
  });

  it.each([
    { name: '다미정', why: '결과 없음(null)' },
    { name: '라옛날', why: '옛 백엔드(필드 없음)' },
    { name: '마이상', why: '모르는 결과 값 — 알려진 값만 막는다' },
  ])('확정 라운드 배정 멤버가 $why 이면 [일정 변경]이 그대로다 — 배지도 배정됨', async ({ name }) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED_WITH_DECIDED_ASSIGNED, message: null }),
      ),
    );

    renderDashboard();
    const row = await findMemberGroup(name);

    expect(within(row).getByRole('button', { name: '일정 변경' })).toBeInTheDocument();
    expect(within(row).queryByText(/결과 확정/)).not.toBeInTheDocument();
    expect(within(row).getByText('배정됨')).toBeInTheDocument();
  });

  it.each([
    { name: '바일괄', why: '표 — 응답 완료 + 불합격(총동연 일괄 불합격)' },
    { name: '사이전', why: '표 — 배정됨 + 합격(#1659 이전)' },
    { name: '자가능', why: '가능없음 섹션 — 가능없음 + 불합격' },
  ])('배정 검토 단계에서 결과가 정해졌는데 남은 멤버($why)는 [수동 배정] 대신 이유를 보이고 [제외]는 둔다', async ({ name }) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_WITH_DECIDED_REMAINING, message: null }),
      ),
    );

    renderDashboard();
    const row = await findMemberGroup(name);

    expect(within(row).queryByRole('button', { name: '수동 배정' })).not.toBeInTheDocument();
    expect(within(row).getByText('결과 확정 — 수동 배정 불가')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: '제외' })).toBeInTheDocument();
  });

  it.each(['아미정', '차가능'])('배정 검토 단계에서 결과가 없는 멤버(%s)는 [수동 배정]이 그대로다', async (name) => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_WITH_DECIDED_REMAINING, message: null }),
      ),
    );

    renderDashboard();
    const row = await findMemberGroup(name);

    expect(within(row).getByRole('button', { name: '수동 배정' })).toBeInTheDocument();
    expect(within(row).queryByText(/결과 확정/)).not.toBeInTheDocument();
  });
});

describe('라운드 현황 후속 — 일정 변경 창을 열 때 다시 받기·라운드 취소 뒤 포커스', () => {
  const waitForFocusGuardTick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const DETAIL_CANCELLED = { ...DETAIL_COLLECTING_BEFORE_DEADLINE, status: 'CANCELLED' };

  it('확정 단계 [일정 변경]을 열면 상세를 다시 받아, 창을 닫은 사이 다른 탭이 옮긴 일정을 지금 일정으로 보인다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_HOLDER_PENDING_CONFIRMED : DETAIL_HOLDER_MOVED_TO_22_CONFIRMED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
    );

    renderDashboard();
    await screen.findByText('확정');
    await userEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '일정 변경' }));
    const dialog = await screen.findByRole('dialog');
    const [, slot21Radio, slot22Radio] = within(dialog).getAllByRole('radio');

    await waitFor(() => expect(slot22Radio!.closest('label')).toHaveTextContent('· 지금 일정'));
    expect(slot21Radio!.closest('label')).not.toHaveTextContent('지금 일정');
    expect(slot22Radio).toBeChecked();
    expect(within(dialog).getByRole('button', { name: '배정' })).toBeDisabled();
    expect(detailGetCount).toBe(2);
  });

  it('배정 검토 단계 [수동 배정]은 열 때 다시 받지 않는다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        return HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_HOLDER_PENDING, message: null });
      }),
    );

    const { queryClient } = renderDashboard();
    await screen.findByText('배정 검토 중');
    // 다시 받기는 클릭 핸들러 안에서 동기로 '받는 중'이 된다 — 시간으로 기다리지 않고 바로 본다.
    fireEvent.click(within(memberRow('오세훈')!).getByRole('button', { name: '수동 배정' }));
    expect(queryClient.isFetching({ queryKey: interviewRoundKeys.detail(ROUND_ID) })).toBe(0);
    await screen.findByRole('dialog');
    expect(detailGetCount).toBe(1);
  });

  it('확정 단계 [일정 변경]을 열고 다시 받기가 오기 전에 [취소]로 닫으면 표지가 남아, 그 뒤 포커스가 빠진 채 다시 받기가 오면 그 멤버 행으로 간다(받아들인 동작)', async () => {
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, async () => {
        detailGetCount += 1;
        if (detailGetCount >= 2) await refetchGate;
        return HttpResponse.json({ ok: true, data: DETAIL_SCHEDULED, message: null });
      }),
    );

    try {
      renderDashboard();
      await screen.findByText('확정');
      const rescheduleButton = within(memberRow('홍길동')!).getByRole('button', { name: '일정 변경' });
      await userEvent.click(rescheduleButton);
      const dialog = await screen.findByRole('dialog');
      await waitFor(() => expect(detailGetCount).toBe(2));

      // 열 때 다시 받기를 붙잡은 채 닫는다 — 닫힘 정리는 '받는 중'이라 멤버 행 표지를 남긴다.
      await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
      await waitFor(() => expect(rescheduleButton).toHaveFocus());
      await waitForFocusGuardTick();
      rescheduleButton.blur();

      releaseRefetch();
      await waitFor(() => expect(screen.getByRole('group', { name: /^홍길동 / })).toHaveFocus());
    } finally {
      releaseRefetch();
    }
  });

  // userEvent 는 [라운드 취소]에 포커스를 주고(닫히면 공용 복귀가 그리로 돌려놓는다), fireEvent 는 주지 않는다(Safari 경로) — 둘 다 막대가 사라진 뒤 배너로 간다.
  it.each([
    { clickPath: 'userEvent(버튼에 포커스)', clickButton: (button: HTMLElement) => userEvent.click(button) },
    { clickPath: 'fireEvent(포커스 없음 — Safari)', clickButton: async (button: HTMLElement) => { fireEvent.click(button); } },
  ])('[라운드 취소]가 성공해 동작 막대가 사라지면 포커스가 상태 배너(취소 1차 면접)로 간다 — $clickPath', async ({ clickButton }) => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_COLLECTING_BEFORE_DEADLINE : DETAIL_CANCELLED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
    );

    renderDashboard();
    await screen.findByText('응답 수집 중');
    await clickButton(screen.getByRole('button', { name: '라운드 취소' }));
    const dialog = await screen.findByRole('dialog');
    await clickButton(within(dialog).getByRole('button', { name: '라운드 취소하기' }));

    await waitFor(() => expect(screen.getByRole('group', { name: '취소 1차 면접' })).toHaveFocus());
    expect(screen.queryByRole('button', { name: '라운드 취소' })).not.toBeInTheDocument();
  });

  it('[라운드 취소]가 실패하면(500) 표지를 세우지 않는다 — 그 뒤 포커스가 빠진 채 오는 다시 받기가 배너로 끌어오지 않는다', async () => {
    let detailGetCount = 0;
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () => {
        detailGetCount += 1;
        const data = detailGetCount === 1 ? DETAIL_COLLECTING_BEFORE_DEADLINE : DETAIL_CANCELLED;
        return HttpResponse.json({ ok: true, data, message: null });
      }),
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () =>
        HttpResponse.json({ ok: false, data: null, message: SERVER_ERROR_MESSAGE }, { status: 500 }),
      ),
    );

    const { queryClient } = renderDashboard();
    await screen.findByText('응답 수집 중');
    const cancelRoundButton = screen.getByRole('button', { name: '라운드 취소' });
    await userEvent.click(cancelRoundButton);
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '라운드 취소하기' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(SERVER_ERROR_MESSAGE);
    await userEvent.click(within(dialog).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(cancelRoundButton).toHaveFocus());

    // 표지를 세우지 않는 갱신(다른 탭이 취소)이 와도 배너로 끌려가지 않는다.
    cancelRoundButton.blur();
    await queryClient.invalidateQueries({ queryKey: interviewRoundKeys.detail(ROUND_ID) });
    await waitFor(() => expect(screen.queryByRole('button', { name: '라운드 취소' })).not.toBeInTheDocument());
    await waitForFocusGuardTick();
    expect(document.body).toHaveFocus();
  });
});

describe('라운드 현황 후속 — 확정 409 창 높이', () => {
  it('확정 409 창은 미처리 지원자 목록만 스크롤하고, 설명·실패 문구·버튼은 스크롤 밖에 둔다 — 목록 영역은 키보드로 스크롤하게 포커스를 받는다', async () => {
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: DETAIL_ASSIGNING_FREED_SEAT, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/confirm`, ({ request }) =>
        new URL(request.url).searchParams.get('force') === 'true'
          ? HttpResponse.json({ ok: false, data: null, message: SERVER_ERROR_MESSAGE }, { status: 500 })
          : HttpResponse.json({ ok: false, data: FREED_SEAT_UNRESOLVED_PAYLOAD, message: '미처리 멤버가 있습니다.' }, { status: 409 }),
      ),
    );

    renderDashboard();
    await screen.findByText('배정 검토 중');
    await userEvent.click(screen.getByRole('button', { name: /^확정$/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /강제 확정/ }));
    const alert = await within(dialog).findByRole('alert');

    // 320×568 에서 창 전체가 스크롤되면 [강제 확정]이 처음에 화면 밖이다 — 창 높이에 상한을 두고 목록만 스크롤한다.
    expect(dialog).toHaveClass('max-h-[calc(100dvh-4rem)]', 'flex', 'flex-col');
    expect(dialog).not.toHaveClass('overflow-y-auto');
    const listRegion = within(dialog).getByRole('region', { name: '미처리 지원자' });
    expect(listRegion).toHaveClass('min-h-0', 'overflow-y-auto');
    expect(listRegion).toHaveAttribute('tabindex', '0');
    expect(listRegion).toContainElement(within(dialog).getByText('최유리'));
    expect(listRegion).not.toContainElement(alert);
    expect(listRegion).not.toContainElement(within(dialog).getByText(/자동으로 제외됩니다/));
    expect(listRegion).not.toContainElement(within(dialog).getByRole('button', { name: /강제 확정/ }));
    expect(listRegion).not.toContainElement(within(dialog).getByRole('button', { name: '취소' }));
  });
});
