import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { delay, http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider, interviewRoundKeys } from '@duing/hooks';
import { RoundWizard } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/interview/rounds/new/_components/RoundWizard';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

// MSW 기반 통합 테스트 — wizard 4단계 흐름 + DRAFT 이어하기/폐기.
// TanStack Query 자체를 mock 하지 않고 네트워크 레벨에서 mocking 한다.

const CLUB_ID = 1;
const RECRUITMENT_ID = 10;
const ROUND_ID = 99;

const server = setupServer();
const apiClient = createApiClient({ baseUrl: 'http://localhost:8080/api/v1' });

// ── MSW 픽스처 ──────────────────────────────────────────────────────────────

/** 미결정 — SUBMITTED 후보 1건 */
const CANDIDATE_SUBMITTED = {
  applicationId: 1,
  userId: 101,
  userName: '김지원',
  studentId: '20220001',
  college: 'ENGINEERING',
  major: '컴퓨터공학과',
  grade: 'SOPHOMORE',
  status: 'SUBMITTED',
  submittedAt: '2026-06-01T10:00:00',
};

/** 미결정 — ON_HOLD 후보 1건 (SUBMITTED 와 같은 그룹에 묶여야 한다) */
const CANDIDATE_ON_HOLD = {
  applicationId: 3,
  userId: 103,
  userName: '박보류',
  studentId: '20220003',
  college: 'ENGINEERING',
  major: '전자공학과',
  grade: 'SENIOR',
  status: 'ON_HOLD',
  submittedAt: '2026-06-01T10:30:00',
};

/** 면접 대상 후보 1건 */
const CANDIDATE_INTERVIEW_PENDING = {
  applicationId: 2,
  userId: 102,
  userName: '이면접',
  studentId: '20220002',
  college: 'ENGINEERING',
  major: '소프트웨어학과',
  grade: 'JUNIOR',
  status: 'INTERVIEW_PENDING',
  submittedAt: '2026-06-01T11:00:00',
};

/** DRAFT 라운드 요약 */
const DRAFT_ROUND_SUMMARY = {
  roundId: ROUND_ID,
  title: '2차 면접',
  status: 'DRAFT',
  availabilityDeadline: null,
  location: null,
  totalMemberCount: 2,
  respondedMemberCount: 0,
};

/** 남은 면접 대상이 없는 DRAFT 라운드 요약(전원 제외·탈퇴·결과 확정) */
const EMPTY_DRAFT_ROUND_SUMMARY = { ...DRAFT_ROUND_SUMMARY, totalMemberCount: 0 };

const INTERVIEW_LANDING_HREF = `/manage/clubs/${CLUB_ID}/recruitments/${RECRUITMENT_ID}/interview`;
const EMPTY_DRAFT_BODY_TEXT = '남은 면접 대상자가 없어 이 라운드는 발송할 수 없습니다. 폐기해주세요.';
const EMPTY_DRAFT_NOTE_TEXT = '이 라운드의 면접 대상자는 모두 합격·불합격이 정해졌거나 라운드에서 빠졌습니다.';

function handleCandidatesRequest({ request }: { request: Request }) {
  const url = new URL(request.url);
  return handleCandidates(url.searchParams.get('includeUndecided') === 'true');
}

/** 슬롯 없는 라운드 상세 (발송 조건 미충족) */
const ROUND_DETAIL_NO_SLOTS = {
  roundId: ROUND_ID,
  title: '1차 면접',
  status: 'DRAFT',
  availabilityDeadline: '2026-07-01T18:00:00',
  location: '공학관',
  requestSequence: 1,
  deadlinePassed: false,
  counts: {
    totalMemberCount: 1,
    invitedCount: 1,
    respondedCount: 0,
    noAvailableSlotCount: 0,
    assignedCount: 0,
    excludedCount: 0,
    unrespondedCount: 1,
  },
  members: [
    {
      memberId: 1,
      applicationId: 1,
      userName: '김지원',
      studentId: '20220001',
      status: 'INVITED',
      unresponded: true,
      alternativeAvailabilityText: null,
      selectedSlotCount: 0,
      assignedSlotId: null,
    },
  ],
  slots: [],
};

/** 슬롯 1개 있는 라운드 상세 (발송 조건 충족) */
const ROUND_DETAIL_WITH_SLOTS = {
  ...ROUND_DETAIL_NO_SLOTS,
  slots: [
    {
      slotId: 10,
      startTime: '2026-07-15T10:00:00',
      endTime: '2026-07-15T10:30:00',
      capacity: 2,
      selectedCount: 0,
      assignedCount: 0,
    },
  ],
};

// 공통 핸들러 헬퍼
function handleCandidates(includeUndecided: boolean) {
  const candidates =
    includeUndecided
      ? [CANDIDATE_SUBMITTED, CANDIDATE_ON_HOLD, CANDIDATE_INTERVIEW_PENDING]
      : [CANDIDATE_INTERVIEW_PENDING];
  return HttpResponse.json({ ok: true, data: candidates, message: null });
}

function handleEmptyRoundList() {
  return HttpResponse.json({ ok: true, data: [], message: null });
}

/** 인원 0 초안 하나뿐인 목록과 후보 목록을 준다. */
function serveEmptyDraftRound() {
  server.use(
    http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
      HttpResponse.json({ ok: true, data: [EMPTY_DRAFT_ROUND_SUMMARY], message: null }),
    ),
    http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
  );
}

/**
 * 목록 요청 수를 세며 마운트 요청(첫 번째)에는 mountRounds, 그 뒤 다시 받기에는 refetchRounds 를 준다.
 * refetchStatus 가 200 이 아니면 다시 받기는 그 상태의 오류로 답한다.
 * 응답은 늦춘다 — MSW 즉시 응답이면 다시 받는 중 상태가 한 번도 그려지지 않아 게이트 항을 지워도 갈리지 않는다.
 */
function serveCountedRoundLists(
  mountRounds: Array<typeof DRAFT_ROUND_SUMMARY>,
  refetchRounds: Array<typeof DRAFT_ROUND_SUMMARY>,
  refetchStatus = 200,
) {
  const roundListRequests = { count: 0 };
  server.use(
    http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async () => {
      roundListRequests.count += 1;
      const isMountRequest = roundListRequests.count === 1;
      await delay(50);
      if (!isMountRequest && refetchStatus !== 200) {
        return HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: refetchStatus });
      }
      return HttpResponse.json({ ok: true, data: isMountRequest ? mountRounds : refetchRounds, message: null });
    }),
  );
  return roundListRequests;
}

// ── 테스트 설정 ──────────────────────────────────────────────────────────────

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function createWizardQueryClient(staleTime = 0) {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime },
      mutations: { retry: false },
    },
  });
}

function renderWizard(queryClient: QueryClient = createWizardQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ApiClientProvider client={apiClient}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </ApiClientProvider>
    );
  }

  return render(
    <Wrapper>
      <RoundWizard clubId={CLUB_ID} recruitmentId={RECRUITMENT_ID} />
    </Wrapper>,
  );
}

const elementWatchStops: Array<() => void> = [];
afterEach(() => {
  elementWatchStops.splice(0).forEach((stopWatch) => stopWatch());
});

/**
 * 렌더 도중 잠깐 붙었다 사라진 요소까지 잡는다 — 마지막 화면만 보는 단언은 중간 상태를 놓친다.
 * childList 만 본다 — 기존 노드의 글자·속성 변화는 놓친다.
 */
function watchForElement(isTarget: (element: Element) => boolean) {
  const containsTarget = (node: Node) =>
    node instanceof Element && (isTarget(node) || Array.from(node.querySelectorAll('*')).some(isTarget));
  let seen = Array.from(document.body.querySelectorAll('*')).some(isTarget);
  const recordMutations = (mutationRecords: MutationRecord[]) => {
    if (mutationRecords.some((mutationRecord) => Array.from(mutationRecord.addedNodes).some(containsTarget))) {
      seen = true;
    }
  };
  const observer = new MutationObserver(recordMutations);
  observer.observe(document.body, { childList: true, subtree: true });
  elementWatchStops.push(() => observer.disconnect());
  return {
    hasSeen: () => {
      recordMutations(observer.takeRecords());
      return seen;
    },
  };
}

const ROUNDS_LOADING_LABEL = '면접 라운드 불러오는 중';
const isRoundsLoadingGate = (element: Element) =>
  element.getAttribute('role') === 'status' && element.getAttribute('aria-label') === ROUNDS_LOADING_LABEL;
const isResumeButton = (element: Element) =>
  element.tagName === 'BUTTON' && element.textContent?.includes('이어하기') === true;
const roundListKey = interviewRoundKeys.list(RECRUITMENT_ID);

// ── 테스트 23개(16·21번은 두 경우씩이라 25건 실행) ─────────────────────────────

describe('RoundWizard — 면접 라운드 생성 wizard', () => {
  it('1. 후보 목록이 미결정과 면접 대상 그룹으로 나뉘어 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
    );

    renderWizard();

    await waitFor(() => {
      // 그룹 헤더 (h3)
      expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
      expect(screen.getByText('면접 대상', { selector: 'h3' })).toBeInTheDocument();
    });

    // 미결정 그룹은 SUBMITTED·ON_HOLD 를 함께 담는다 (상태 뱃지는 운영진 라벨)
    expect(screen.getByText('지원 완료')).toBeInTheDocument();
    expect(screen.getByText('보류')).toBeInTheDocument();
    // 그룹 헤더도 "면접 대상"이라 배지(span)로 좁힌다
    expect(screen.getByText('면접 대상', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('(2명)')).toBeInTheDocument();
    // 옛 그룹 헤더 표기는 남지 않는다
    expect(screen.queryByText('미결정(지원·보류)')).not.toBeInTheDocument();
    expect(screen.queryByText('면접 대기')).not.toBeInTheDocument();
  });

  it('2. 미결정 포함 토글을 끄면 대기열만 다시 조회한다', async () => {
    let capturedInclude: string | null = null;

    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        capturedInclude = url.searchParams.get('includeUndecided');
        const include = capturedInclude === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
    );

    renderWizard();

    // 초기 로드 완료 대기 (그룹 헤더 h3 기준)
    await waitFor(() => {
      expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    });

    // 토글 끄기
    const toggle = screen.getByRole('checkbox', { name: /미결정 포함/ });
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(capturedInclude).toBe('false');
    });

    // 미결정 그룹 헤더(h3)가 사라져야 함
    await waitFor(() => {
      expect(screen.queryByText('미결정(지원 완료·보류)', { selector: 'h3' })).not.toBeInTheDocument();
    });
  });

  it('3. 후보를 선택하지 않으면 다음 단계로 갈 수 없다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
    );

    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    });

    // 선택 0 → [다음] disabled
    const nextButton = screen.getByRole('button', { name: /다음/ });
    expect(nextButton).toBeDisabled();

    // 후보 1명 선택 → enabled + 카운터
    const checkbox = screen.getByRole('checkbox', { name: /김지원 선택/ });
    await userEvent.click(checkbox);

    expect(nextButton).not.toBeDisabled();
    expect(screen.getByText(/1명 선택/)).toBeInTheDocument();
  });

  it('4. 라운드 생성 시 선택한 지원자와 입력값이 그대로 전송되고 미결정 전환 경고가 보인다', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          ok: true,
          data: { roundId: ROUND_ID },
          message: null,
        });
      }),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
    );

    renderWizard();

    await waitFor(() => {
      expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    });

    // 미결정 후보 선택
    const checkbox = screen.getByRole('checkbox', { name: /김지원 선택/ });
    await userEvent.click(checkbox);

    // 다음 단계(Step2)로 이동
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));

    // Step2: 미결정 전환 경고 문구
    await waitFor(() => {
      expect(screen.getByText(/미결정 지원자 1명이 면접 대상으로 전환됩니다/)).toBeInTheDocument();
    });

    // 제목 입력 및 마감일 입력
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');

    // 제출
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({
        title: '1차 면접',
        availabilityDeadline: '2026-07-01T18:00',
        applicationIds: [1],
      });
    });
  });

  it('5. 라운드 생성 후 슬롯 단계에서 패턴으로 슬롯을 일괄 생성한다', async () => {
    let capturedSlots: unknown = null;

    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async () =>
        HttpResponse.json({ ok: true, data: { roundId: ROUND_ID }, message: null }),
      ),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/slots`, async ({ request }) => {
        const body = await request.json() as { slots: unknown[] };
        capturedSlots = body.slots;
        return HttpResponse.json({
          ok: true,
          data: { createdSlotIds: [10], reinvitedMemberCount: 1 },
          message: null,
        });
      }),
    );

    renderWizard();

    // Step1 → 후보 선택 → Step2 → 라운드 생성 → Step3
    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));
    await waitFor(() => screen.getByLabelText(/라운드 제목/));
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));

    // Step3 도달 — 슬롯 패턴 폼 로드 대기
    await waitFor(() => {
      expect(screen.getByLabelText(/시작 날짜/)).toBeInTheDocument();
    });

    // 패턴 입력 후 슬롯 생성 (number 입력은 fireEvent.change 로 직접 설정)
    await userEvent.type(screen.getByLabelText(/시작 날짜/), '2026-07-15');
    await userEvent.type(screen.getByLabelText(/시작 시각/), '10:00');
    await userEvent.type(screen.getByLabelText(/종료 시각/), '11:00');
    fireEvent.change(screen.getByLabelText(/면접 시간.*분/), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/정원/), { target: { value: '2' } });

    await userEvent.click(screen.getByRole('button', { name: /슬롯 생성/ }));

    await waitFor(() => {
      expect(capturedSlots).toBeDefined();
      const slots = capturedSlots as Array<{ startTime: string; endTime: string; capacity: number }>;
      expect(slots.length).toBeGreaterThan(0);
      expect(slots[0]).toHaveProperty('capacity', 2);
    });
  });

  it('6. 발송 조건이 충족되지 않으면 발송 버튼이 비활성이고 사유가 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async () =>
        HttpResponse.json({ ok: true, data: { roundId: ROUND_ID }, message: null }),
      ),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
    );

    renderWizard();

    // Step1 → 2 → 3 → 4
    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));
    await waitFor(() => screen.getByLabelText(/라운드 제목/));
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));
    // 슬롯 등록 단계 — 슬롯 패턴 폼 로드 대기 후 다음 진행
    await waitFor(() => screen.getByLabelText(/시작 날짜/));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));

    // Step4 — 슬롯 0이라 발송 버튼 disabled + 사유 텍스트
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /발송/ })).toBeDisabled();
      expect(screen.getByText(/슬롯을 1개 이상 등록/)).toBeInTheDocument();
    });
  });

  it('7. 발송하면 알림 인원수와 함께 완료 화면이 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async () =>
        HttpResponse.json({ ok: true, data: { roundId: ROUND_ID }, message: null }),
      ),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_WITH_SLOTS, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/request-availability`, () =>
        HttpResponse.json({
          ok: true,
          data: { notifiedMemberCount: 3 },
          message: null,
        }),
      ),
    );

    renderWizard();

    // Step1 → 2 → 3 → 4
    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));
    await waitFor(() => screen.getByLabelText(/라운드 제목/));
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));
    // 슬롯 등록 단계 — 슬롯 패턴 폼 로드 대기 후 다음 진행
    await waitFor(() => screen.getByLabelText(/시작 날짜/));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));

    // Step4 — 슬롯 있으므로 발송 가능
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /발송/ })).not.toBeDisabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /발송/ }));

    // 완료 화면
    await waitFor(() => {
      expect(screen.getByText(/3명에게 알림/)).toBeInTheDocument();
    });
  });

  it('8. 기존 DRAFT 라운드가 있으면 이어하기와 폐기를 선택할 수 있다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [DRAFT_ROUND_SUMMARY], message: null }),
      ),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
    );

    renderWizard();

    // DRAFT 감지 다이얼로그 노출
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText(/작성 중인 라운드/)).toBeInTheDocument();
      expect(screen.getByText(/2차 면접/)).toBeInTheDocument();
    });

    await waitFor(() => expect(screen.getByRole('button', { name: /이어하기/ })).toHaveFocus());
    const resumeDiscardButton = screen.getByRole('button', { name: /폐기하고 새로 만들기/ });
    expect(resumeDiscardButton).toHaveClass('btn', 'btn-danger-quiet', 'btn-sm');
    expect(resumeDiscardButton.nextElementSibling).toBe(screen.getByRole('button', { name: /이어하기/ }));
    // 좁은 폭에서 '만들 수 있습니 / 다' 처럼 음절 사이에서 끊기지 않게(인원 0 판과 같은 규칙).
    expect(screen.getByText('이어서 작성하거나, 폐기하고 새로운 라운드를 만들 수 있습니다.')).toHaveClass('break-keep');
    expect(screen.getByText('폐기 시 해당 라운드의 면접 대상자들이 대기열로 돌아갑니다.')).toHaveClass('break-keep');
    expect(screen.queryByText(EMPTY_DRAFT_BODY_TEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '면접 관리로' })).not.toBeInTheDocument();

    // [이어하기] → Step2 이동 (제목 표시 + 프리필 값 확인)
    await userEvent.click(screen.getByRole('button', { name: /이어하기/ }));

    await waitFor(() => {
      expect(screen.getByLabelText(/라운드 제목/)).toBeInTheDocument();
      expect(screen.getByLabelText(/라운드 제목/)).toHaveValue(ROUND_DETAIL_NO_SLOTS.title);
    });
  });

  it('9. 폐기를 선택하면 라운드가 취소되고 후보 선정부터 시작한다', async () => {
    let cancelCalled = false;

    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [DRAFT_ROUND_SUMMARY], message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () => {
        cancelCalled = true;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
    );

    renderWizard();

    // DRAFT 다이얼로그 → [폐기하고 새로 만들기]
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('button', { name: /폐기하고 새로 만들기/ }));

    await waitFor(() => {
      expect(cancelCalled).toBe(true);
    });

    // Step1 노출 (그룹 헤더 h3 기준)
    await waitFor(() => {
      expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    });
  });

  it('10. 토글을 꺼도 이미 선택한 미결정 후보는 선택 상태로 유지되고 경고 인원에 포함된다', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ ok: true, data: { roundId: ROUND_ID }, message: null });
      }),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
    );

    renderWizard();

    // includeUndecided=true 상태에서 미결정 후보(김지원) 선택
    await waitFor(() => {
      expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));

    // 토글 off — 미결정 목록이 화면에서 사라짐
    const toggle = screen.getByRole('checkbox', { name: /미결정 포함/ });
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText('미결정(지원 완료·보류)', { selector: 'h3' })).not.toBeInTheDocument();
    });

    // INTERVIEW_PENDING 후보(이면접) 추가 선택
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /이면접 선택/ })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /이면접 선택/ }));

    // 카운터: 총 2명 선택
    expect(screen.getByText(/2명 선택/)).toBeInTheDocument();

    // 다음으로 이동 → Step2 에서 미결정 전환 경고 "1명" 표시
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));

    await waitFor(() => {
      expect(screen.getByText(/미결정 지원자 1명이 면접 대상으로 전환됩니다/)).toBeInTheDocument();
    });

    // 제출하면 두 후보 모두 전송
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({
        applicationIds: expect.arrayContaining([1, 2]),
      });
    });
  });

  it('11. 종료 시각이 시작보다 빠르면 에러가 보이고 슬롯 생성 요청이 가지 않는다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async () =>
        HttpResponse.json({ ok: true, data: { roundId: ROUND_ID }, message: null }),
      ),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
    );

    renderWizard();

    // Step1 → 후보 선택 → Step2 → 라운드 생성 → Step3
    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));
    await waitFor(() => screen.getByLabelText(/라운드 제목/));
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));

    // Step3 도달
    await waitFor(() => {
      expect(screen.getByLabelText(/시작 날짜/)).toBeInTheDocument();
    });

    // 역범위 입력 (종료 시각 < 시작 시각)
    await userEvent.type(screen.getByLabelText(/시작 날짜/), '2026-07-15');
    await userEvent.type(screen.getByLabelText(/시작 시각/), '11:00');
    await userEvent.type(screen.getByLabelText(/종료 시각/), '09:00');
    fireEvent.change(screen.getByLabelText(/면접 시간.*분/), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText(/정원/), { target: { value: '2' } });

    await userEvent.click(screen.getByRole('button', { name: /슬롯 생성/ }));

    // 에러 텍스트 노출 — 슬롯 생성 API 요청은 가지 않음
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/종료 시각은 시작 시각보다 늦어야 합니다/);
    });
  });

  it('12. 후보 이름을 눌러도 선택되고, 후보 행·그룹 전체 선택의 터치 영역은 44px 이다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
    );

    renderWizard();

    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));

    // 체크박스가 아닌 이름 글자를 눌러도 한 번만 토글돼 선택된다
    await userEvent.click(screen.getByText('김지원', { selector: 'span' }));
    const candidateCheckbox = screen.getByRole('checkbox', { name: '김지원 선택' });
    expect(candidateCheckbox).toBeChecked();
    expect(screen.getByText(/1명 선택/)).toBeInTheDocument();

    // jsdom 은 크기를 못 재므로 의도 클래스로 못박는다(실측은 브라우저 QA)
    // 후보 행: lg 미만만 44px, PC 는 기존 36px 유지
    expect(candidateCheckbox.closest('label')).toHaveClass('min-h-11', 'lg:min-h-0');
    // 후보 글자: lg 미만은 이름 아래 학과·학년 글줄(어절 단위로 접음), PC 는 감싼 칸이 사라져(lg:contents) 기존 한 줄
    expect(candidateCheckbox).toHaveClass('shrink-0');
    expect(screen.getByText('김지원', { selector: 'span' }).parentElement).toHaveClass(
      'break-keep',
      'lg:contents',
    );
    // 그룹 전체 선택: 44px 정사각, 사방 음수 여백으로 배치 자리는 체크박스 16px 그대로, 제목(h3)은 라벨 밖
    const groupLabel = screen
      .getByRole('checkbox', { name: '미결정(지원 완료·보류) 전체 선택' })
      .closest('label');
    expect(groupLabel).toHaveClass('h-11', 'w-11', '-m-3.5');
    expect(groupLabel).not.toContainElement(
      screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }),
    );
  });

  it('13. 그룹 전체 선택의 라벨(넓힌 터치 영역)을 누르면 그 그룹 후보가 모두 선택된다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, ({ request }) => {
        const url = new URL(request.url);
        const include = url.searchParams.get('includeUndecided') === 'true';
        return handleCandidates(include);
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => handleEmptyRoundList()),
    );

    renderWizard();

    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));

    const groupCheckbox = screen.getByRole('checkbox', { name: '미결정(지원 완료·보류) 전체 선택' });
    const groupLabel = groupCheckbox.closest('label');
    if (!groupLabel) throw new Error('그룹 전체 선택 체크박스를 감싼 label 이 없다');
    await userEvent.click(groupLabel);

    expect(groupCheckbox).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '김지원 선택' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '박보류 선택' })).toBeChecked();
    // 다른 그룹(면접 대상)은 건드리지 않는다
    expect(screen.getByRole('checkbox', { name: '이면접 선택' })).not.toBeChecked();
    expect(screen.getByText(/2명 선택/)).toBeInTheDocument();
  });

  it('14. 인원 0 초안이면 이어하기 대신 면접 관리로가 보이고, 폐기 진행 중에는 이동이 막히고, 폐기하면 후보 선정부터 시작한다', async () => {
    let releaseCancel: () => void = () => {};
    const cancelResponseGate = new Promise<void>((resolve) => {
      releaseCancel = resolve;
    });
    serveEmptyDraftRound();
    server.use(
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, async () => {
        await cancelResponseGate;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
    );

    renderWizard();

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    // 좁은 폭에서 '폐 / 기해주세요' 처럼 음절 사이에서 끊기지 않게.
    expect(screen.getByText(EMPTY_DRAFT_BODY_TEXT)).toHaveClass('break-keep');
    expect(screen.getByText(EMPTY_DRAFT_NOTE_TEXT)).toHaveClass('break-keep');
    expect(screen.queryByText(/대기열로 돌아갑니다/)).not.toBeInTheDocument();
    expect(screen.queryByText(/이어서 작성하거나/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /이어하기/ })).not.toBeInTheDocument();

    const landingLink = screen.getByRole('link', { name: '면접 관리로' });
    const discardButton = screen.getByRole('button', { name: /폐기하고 새로 만들기/ });
    // ConfirmDialog 관례 — [안전 ghost][핵심 solid danger] 순서.
    expect(landingLink).toHaveClass('btn', 'btn-ghost', 'btn-sm');
    expect(discardButton).toHaveClass('btn', 'btn-danger', 'btn-sm');
    expect(landingLink.nextElementSibling).toBe(discardButton);

    // 안전한 쪽에서 시작하고(ConfirmDialog 관례) 두 동작 사이를 Tab 으로 돈다.
    await waitFor(() => expect(landingLink).toHaveFocus());
    await userEvent.tab();
    expect(discardButton).toHaveFocus();
    await userEvent.tab();
    expect(landingLink).toHaveFocus();

    // 단언이 실패해도 붙잡아 둔 폐기 응답은 풀어 핸들러가 끝나게 한다.
    try {
      await userEvent.click(discardButton);
      await waitFor(() => expect(landingLink).toHaveAttribute('aria-disabled', 'true'));
      expect(fireEvent.click(landingLink)).toBe(false);
      // 폐기 진행을 화면 낭독기에도 알린다(#914 — 버튼 밖 sr-only 상태 리전 + 창 aria-busy).
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByRole('status')).toHaveTextContent('라운드 폐기 중');
      expect(dialog).toHaveAttribute('aria-busy', 'true');
    } finally {
      releaseCancel();
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
  });

  it('인원 있는 초안 창도 폐기 진행 중에는 창 안 상태 리전에 라운드 폐기 중을 알린다', async () => {
    let releaseCancel: () => void = () => {};
    const cancelResponseGate = new Promise<void>((resolve) => {
      releaseCancel = resolve;
    });
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [DRAFT_ROUND_SUMMARY], message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, async () => {
        await cancelResponseGate;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
    );

    renderWizard();

    try {
      await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));
      const dialog = screen.getByRole('dialog');
      await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('라운드 폐기 중'));
      expect(dialog).toHaveAttribute('aria-busy', 'true');
    } finally {
      releaseCancel();
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('15. 인원 0 초안 창의 면접 관리로는 href 가 면접 관리 랜딩이고 이동을 막지 않는다', async () => {
    serveEmptyDraftRound();

    renderWizard();

    const landingLink = await screen.findByRole('link', { name: '면접 관리로' });
    expect(landingLink).toHaveAttribute('href', INTERVIEW_LANDING_HREF);
    expect(landingLink).not.toHaveAttribute('aria-disabled');
    // 평소에는 막지 않는다 — 라우터 문맥 없는 next/link 클릭은 기본 동작을 그대로 둔다(applicant-card-list 테스트 선례).
    expect(fireEvent.click(landingLink)).toBe(true);
  });

  it.each([
    { cacheState: '낡아도', staleTime: 0 },
    { cacheState: '신선해도', staleTime: 30_000 },
  ])(
    '16. 목록 캐시가 $cacheState 마운트 때 다시 받은 인원으로만 창을 연다 — 캐시 인원 2·서버 인원 0 이면 이어하기가 한 번도 그려지지 않는다',
    async ({ staleTime }) => {
      const roundListRequests = serveCountedRoundLists([EMPTY_DRAFT_ROUND_SUMMARY], [EMPTY_DRAFT_ROUND_SUMMARY]);
      server.use(
        http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
      );
      const queryClient = createWizardQueryClient(staleTime);
      queryClient.setQueryData(roundListKey, [DRAFT_ROUND_SUMMARY]);
      const resumeButtonWatch = watchForElement(isResumeButton);

      renderWizard(queryClient);

      expect(screen.getByRole('status', { name: ROUNDS_LOADING_LABEL })).toBeInTheDocument();
      expect(await screen.findByText(EMPTY_DRAFT_BODY_TEXT)).toBeInTheDocument();
      expect(roundListRequests.count).toBe(1);
      expect(resumeButtonWatch.hasSeen()).toBe(false);
    },
  );

  it('17. 신선한 캐시여도 마운트 때 한 번 받고, 이어하기로 발송해 목록을 다시 받아도 불러오는 중 화면 없이 완료 화면이 남는다', async () => {
    const roundListRequests = serveCountedRoundLists(
      [DRAFT_ROUND_SUMMARY],
      [{ ...DRAFT_ROUND_SUMMARY, status: 'COLLECTING' }],
    );
    server.use(
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_WITH_SLOTS, message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/request-availability`, () =>
        HttpResponse.json({ ok: true, data: { notifiedMemberCount: 3 }, message: null }),
      ),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
    );
    const queryClient = createWizardQueryClient(30_000);
    queryClient.setQueryData(roundListKey, [DRAFT_ROUND_SUMMARY]);

    renderWizard(queryClient);

    const resumeButton = await screen.findByRole('button', { name: /이어하기/ });
    expect(roundListRequests.count).toBe(1);
    // 첫 응답 뒤부터 본다 — 그 뒤의 무효화로 게이트가 다시 서면 지금 단계가 내려간다.
    const loadingGateWatch = watchForElement(isRoundsLoadingGate);
    await userEvent.click(resumeButton);
    await waitFor(() =>
      expect(screen.getByLabelText(/라운드 제목/)).toHaveValue(ROUND_DETAIL_WITH_SLOTS.title),
    );
    await userEvent.click(screen.getByRole('button', { name: '저장하고 다음' }));
    await waitFor(() => screen.getByLabelText(/시작 날짜/));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /발송/ })).not.toBeDisabled());

    await userEvent.click(screen.getByRole('button', { name: /발송/ }));
    // 중간 상태로 통과하지 않게: 발송 무효화로 목록을 다시 받고, 다 받은 뒤에 본다.
    await waitFor(() => expect(roundListRequests.count).toBe(2));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: roundListKey })).toBe(0));
    expect(screen.getByText(/3명에게 알림/)).toBeInTheDocument();
    expect(loadingGateWatch.hasSeen()).toBe(false);
  });

  it('18. 신선한 캐시여도 마운트 때 한 번 받고, 폐기해 목록을 다시 받아도 불러오는 중 화면 없이 새 라운드 1단계로 간다', async () => {
    const roundListRequests = serveCountedRoundLists([EMPTY_DRAFT_ROUND_SUMMARY], []);
    server.use(
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
    );
    const queryClient = createWizardQueryClient(30_000);
    queryClient.setQueryData(roundListKey, [EMPTY_DRAFT_ROUND_SUMMARY]);

    renderWizard(queryClient);

    const discardButton = await screen.findByRole('button', { name: /폐기하고 새로 만들기/ });
    expect(roundListRequests.count).toBe(1);
    const loadingGateWatch = watchForElement(isRoundsLoadingGate);
    await userEvent.click(discardButton);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(roundListRequests.count).toBe(2));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: roundListKey })).toBe(0));
    expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    expect(loadingGateWatch.hasSeen()).toBe(false);
  });

  it('19. 신선한 캐시여도 마운트 때 한 번 받고, 새 라운드를 만들어 목록을 다시 받아도 불러오는 중 화면 없이 슬롯 단계로 간다', async () => {
    const roundListRequests = serveCountedRoundLists(
      [],
      [{ ...DRAFT_ROUND_SUMMARY, title: '1차 면접', totalMemberCount: 1 }],
    );
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: { roundId: ROUND_ID }, message: null }),
      ),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
    );
    const queryClient = createWizardQueryClient(30_000);
    queryClient.setQueryData(roundListKey, []);

    renderWizard(queryClient);

    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));
    expect(roundListRequests.count).toBe(1);
    const loadingGateWatch = watchForElement(isRoundsLoadingGate);
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));
    await waitFor(() => screen.getByLabelText(/라운드 제목/));
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));
    await waitFor(() => screen.getByLabelText(/시작 날짜/));
    // 생성 무효화로 목록을 다시 받는 동안에도 슬롯 단계가 내려가지 않아야 한다.
    await waitFor(() => expect(roundListRequests.count).toBe(2));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: roundListKey })).toBe(0));
    expect(screen.getByLabelText(/시작 날짜/)).toBeInTheDocument();
    expect(loadingGateWatch.hasSeen()).toBe(false);
  });

  it('20. 인원 0 초안 창에서 폐기가 실패하면 오류 문구가 뜨고 면접 관리로가 다시 열린다', async () => {
    serveEmptyDraftRound();
    server.use(
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () =>
        HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
      ),
    );

    renderWizard();

    await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('라운드 폐기 중 오류가 발생했습니다. 다시 시도해주세요.');
    expect(screen.getByRole('link', { name: '면접 관리로' })).not.toHaveAttribute('aria-disabled');
    // 진행이 끝나면 진행 문구를 비우고 창도 바쁘지 않다.
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('status')).toBeEmptyDOMElement();
    expect(dialog).toHaveAttribute('aria-busy', 'false');
  });

  it.each([
    { cacheState: '캐시에 초안이 있어도', cachedRounds: [DRAFT_ROUND_SUMMARY] },
    { cacheState: '캐시가 없어도', cachedRounds: null },
  ])(
    '21. 목록 $cacheState 마운트 때 받기가 실패하면 창도 1단계도 그리지 않고 오류 문구만 보인다 — 이미 발송된 라운드를 폐기할 길을 막는다',
    async ({ cachedRounds }) => {
      let roundListRequestCount = 0;
      server.use(
        http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () => {
          roundListRequestCount += 1;
          return HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 });
        }),
        http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
      );
      const queryClient = createWizardQueryClient(30_000);
      if (cachedRounds) queryClient.setQueryData(roundListKey, cachedRounds);
      const resumeButtonWatch = watchForElement(isResumeButton);

      renderWizard(queryClient);

      expect(screen.getByRole('status', { name: ROUNDS_LOADING_LABEL })).toBeInTheDocument();
      expect(await screen.findByText('서버 오류')).toBeInTheDocument();
      expect(roundListRequestCount).toBe(1);
      // 창이 없으니 폐기 버튼도 없다 — 폐기 요청을 보낼 수단이 그려지지 않는다.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /폐기하고 새로 만들기/ })).not.toBeInTheDocument();
      expect(screen.queryByText('미결정(지원 완료·보류)', { selector: 'h3' })).not.toBeInTheDocument();
      expect(resumeButtonWatch.hasSeen()).toBe(false);
    },
  );

  it('22. 폐기한 뒤 목록 다시 받기가 실패해도 오류 문구로 바뀌지 않고 새 라운드 1단계가 남는다', async () => {
    const roundListRequests = serveCountedRoundLists([EMPTY_DRAFT_ROUND_SUMMARY], [], 500);
    server.use(
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () =>
        HttpResponse.json({ ok: true, data: null, message: null }),
      ),
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
    );
    const queryClient = createWizardQueryClient(30_000);

    renderWizard(queryClient);

    await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(roundListRequests.count).toBe(2));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: roundListKey })).toBe(0));
    // 다시 받기가 정말 실패했는지 — 그래야 고른 뒤 오류를 무시하는 보호 조건을 본다.
    expect(queryClient.getQueryState(roundListKey)?.status).toBe('error');
    expect(screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByText('서버 오류')).not.toBeInTheDocument();
  });

  it('23. 새 라운드를 만든 뒤 목록 다시 받기가 실패해도 오류 문구로 바뀌지 않고 슬롯 단계가 남는다', async () => {
    const roundListRequests = serveCountedRoundLists([], [], 500);
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest),
      http.post(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: { roundId: ROUND_ID }, message: null }),
      ),
      http.get(`*/interview-rounds/${ROUND_ID}`, () =>
        HttpResponse.json({ ok: true, data: ROUND_DETAIL_NO_SLOTS, message: null }),
      ),
    );
    const queryClient = createWizardQueryClient(30_000);

    renderWizard(queryClient);

    await waitFor(() => screen.getByText('미결정(지원 완료·보류)', { selector: 'h3' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));
    await userEvent.click(screen.getByRole('button', { name: /다음/ }));
    await waitFor(() => screen.getByLabelText(/라운드 제목/));
    await userEvent.type(screen.getByLabelText(/라운드 제목/), '1차 면접');
    await userEvent.type(screen.getByLabelText(/가능시간 제출 마감/), '2026-07-01T18:00');
    await userEvent.click(screen.getByRole('button', { name: /라운드 생성/ }));
    await waitFor(() => screen.getByLabelText(/시작 날짜/));
    await waitFor(() => expect(roundListRequests.count).toBe(2));
    await waitFor(() => expect(queryClient.isFetching({ queryKey: roundListKey })).toBe(0));
    expect(queryClient.getQueryState(roundListKey)?.status).toBe('error');
    expect(screen.getByLabelText(/시작 날짜/)).toBeInTheDocument();
    expect(screen.queryByText('서버 오류')).not.toBeInTheDocument();
  });
});

describe('RoundWizard — 폐기가 화면이 본 단계(초안)를 싣기', () => {
  const STALE_ROUND_MESSAGE = '라운드 단계가 바뀌었습니다. 최신 상태를 확인한 뒤 다시 시도해주세요.';
  const DRAFT_GONE_NOTICE = '작성 중이던 라운드가 그사이 발송되었거나 정리되었습니다. 면접 관리에서 지금 상태를 확인해주세요.';
  const SENT_ROUND_SUMMARY = { ...DRAFT_ROUND_SUMMARY, status: 'COLLECTING' };
  const OTHER_DRAFT_ROUND_SUMMARY = { ...DRAFT_ROUND_SUMMARY, roundId: ROUND_ID + 1, title: '3차 면접' };
  const CANCEL_REJECTED_AS_STALE = http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () =>
    HttpResponse.json({ ok: false, data: null, message: STALE_ROUND_MESSAGE }, { status: 409 }),
  );
  const CANDIDATES_HANDLER = http.get(`*/recruitments/${RECRUITMENT_ID}/interview-round-candidates`, handleCandidatesRequest);

  it('[폐기]는 기대 단계 DRAFT 를 쿼리로 실어 보낸다', async () => {
    let cancelUrl = '';
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, () =>
        HttpResponse.json({ ok: true, data: [DRAFT_ROUND_SUMMARY], message: null }),
      ),
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, ({ request }) => {
        cancelUrl = request.url;
        return HttpResponse.json({ ok: true, data: null, message: null });
      }),
      CANDIDATES_HANDLER,
    );

    renderWizard();
    await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));

    await waitFor(() => expect(cancelUrl).not.toBe(''));
    // MSW 경로 매칭은 쿼리를 보지 않는다 — 쿼리는 URL 로 직접 본다.
    expect(new URL(cancelUrl).searchParams.get('expectedRoundStatus')).toBe('DRAFT');
  });

  it('409 로 거절되고 다시 받은 목록에 초안이 없으면 창이 닫히고, 1단계 위에 그사이 발송·정리됐다는 알림이 남는다', async () => {
    const roundListRequests = serveCountedRoundLists([DRAFT_ROUND_SUMMARY], [SENT_ROUND_SUMMARY]);
    server.use(CANCEL_REJECTED_AS_STALE, CANDIDATES_HANDLER);

    renderWizard();
    await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));

    const dialogAlert = await within(screen.getByRole('dialog')).findByRole('alert');
    expect(dialogAlert).toHaveTextContent(STALE_ROUND_MESSAGE);
    // 좁은 폭에서 '시도 / 해주세요' 처럼 음절 사이에서 끊기지 않게 — 서버 문구라 줄보다 긴 한 어절만 글자 단위로 쪼갠다.
    expect(dialogAlert).toHaveClass('break-keep', '[overflow-wrap:anywhere]');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('alert')).toHaveTextContent(DRAFT_GONE_NOTICE);
    // 창 밖 고정 문구도 '정리되었습니 / 다.' 처럼 끊기지 않게.
    expect(screen.getByRole('alert')).toHaveClass('break-keep');
    // 창이 내려가며 body 로 빠진 포커스를 이 알림이 받는다(탭 순서 밖).
    expect(screen.getByRole('alert')).toHaveAttribute('tabindex', '-1');
    await waitFor(() => expect(screen.getByRole('alert')).toHaveFocus());
    expect(await screen.findByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    expect(roundListRequests.count).toBe(2);
  });

  it('409 로 거절되고 다시 받은 목록에 다른 초안이 있으면 창이 그 초안으로 다시 그려지고, 옛 초안의 서버 문구는 남지 않는다', async () => {
    serveCountedRoundLists([DRAFT_ROUND_SUMMARY], [OTHER_DRAFT_ROUND_SUMMARY]);
    server.use(CANCEL_REJECTED_AS_STALE, CANDIDATES_HANDLER);

    renderWizard();
    await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText('3차 면접')).toBeInTheDocument();
    // 서버 문구는 2차 면접의 폐기 거절이다 — 3차 면접 창에는 남기지 않는다(폐기 오류는 그 라운드에 묶는다).
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    await waitFor(() => expect(within(dialog).getByRole('button', { name: /이어하기/ })).toBeEnabled());
    expect(screen.queryByText(DRAFT_GONE_NOTICE)).not.toBeInTheDocument();
  });

  it('409 뒤 목록을 다시 받는 동안에는 [이어하기]·[폐기]가 꺼진다 — 그사이 발송된 라운드로 2단계에 들어가지 않게, 폐기 중이라고 알리지는 않는다', async () => {
    let releaseRefetch: () => void = () => {};
    const refetchGate = new Promise<void>((resolve) => {
      releaseRefetch = resolve;
    });
    let roundListRequestCount = 0;
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, async () => {
        roundListRequestCount += 1;
        if (roundListRequestCount === 1) return HttpResponse.json({ ok: true, data: [DRAFT_ROUND_SUMMARY], message: null });
        await refetchGate;
        return HttpResponse.json({ ok: true, data: [OTHER_DRAFT_ROUND_SUMMARY], message: null });
      }),
      CANCEL_REJECTED_AS_STALE,
      CANDIDATES_HANDLER,
    );

    try {
      renderWizard();
      await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));
      const dialog = screen.getByRole('dialog');
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(STALE_ROUND_MESSAGE);

      // 다시 받기를 붙잡은 동안 — 창은 아직 낡은 초안(2차 면접)을 보인다
      expect(within(dialog).getByText('2차 면접')).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: /이어하기/ })).toBeDisabled();
      const discardButton = within(dialog).getByRole('button', { name: /폐기하고 새로 만들기/ });
      expect(discardButton).toBeDisabled();
      expect(roundListRequestCount).toBe(2);
      // 폐기 요청은 이미 끝났다 — 목록을 받는 동안의 버튼 끄기를 '폐기 중'(스피너·busy·낭독)으로 알리지 않는다.
      expect(within(dialog).getByRole('status')).not.toHaveTextContent('라운드 폐기 중');
      expect(dialog).toHaveAttribute('aria-busy', 'false');
      expect(discardButton.querySelector('svg.animate-spin')).toBeNull();

      releaseRefetch();
      expect(await within(dialog).findByText('3차 면접')).toBeInTheDocument();
      await waitFor(() => expect(within(dialog).getByRole('button', { name: /이어하기/ })).toBeEnabled());
    } finally {
      releaseRefetch();
    }
  });

  it('처음부터 초안이 없으면 1단계 위에 그사이 발송·정리됐다는 알림이 없다 — 폐기가 거절된 뒤에만 보인다', async () => {
    server.use(
      http.get(`*/recruitments/${RECRUITMENT_ID}/interview-rounds`, handleEmptyRoundList),
      CANDIDATES_HANDLER,
    );

    renderWizard();

    expect(await screen.findByText('미결정(지원 완료·보류)', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.queryByText(DRAFT_GONE_NOTICE)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('409 가 아닌 실패(500)는 지금 문구 그대로이고 목록을 다시 받지 않는다', async () => {
    const roundListRequests = serveCountedRoundLists([DRAFT_ROUND_SUMMARY], [DRAFT_ROUND_SUMMARY]);
    server.use(
      http.post(`*/interview-rounds/${ROUND_ID}/cancel`, () =>
        HttpResponse.json({ ok: false, data: null, message: '서버 오류' }, { status: 500 }),
      ),
      CANDIDATES_HANDLER,
    );
    const queryClient = createWizardQueryClient();

    renderWizard(queryClient);
    await userEvent.click(await screen.findByRole('button', { name: /폐기하고 새로 만들기/ }));

    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('라운드 폐기 중 오류가 발생했습니다. 다시 시도해주세요.');
    expect(queryClient.isFetching({ queryKey: roundListKey })).toBe(0);
    expect(roundListRequests.count).toBe(1);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /이어하기/ })).toBeEnabled();
  });
});
