import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createApiClient } from '@duing/api';
import { ApiClientProvider } from '@duing/hooks';
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

/** 면접 대기 후보 1건 */
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

// ── 테스트 설정 ──────────────────────────────────────────────────────────────

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderWizard() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });

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

// ── 테스트 9건 ───────────────────────────────────────────────────────────────

describe('RoundWizard — 면접 라운드 생성 wizard', () => {
  it('1. 후보 목록이 미결정과 면접 대기 그룹으로 나뉘어 보인다', async () => {
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
      expect(screen.getByText('미결정(지원·보류)', { selector: 'h3' })).toBeInTheDocument();
      expect(screen.getByText('면접 대기', { selector: 'h3' })).toBeInTheDocument();
    });

    // 미결정 그룹은 SUBMITTED·ON_HOLD 를 함께 담는다 (상태 뱃지는 운영진 라벨)
    expect(screen.getByText('지원 완료')).toBeInTheDocument();
    expect(screen.getByText('보류')).toBeInTheDocument();
    expect(screen.getByText('면접 대상')).toBeInTheDocument();
    expect(screen.getByText('(2명)')).toBeInTheDocument();
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
      expect(screen.getByText('미결정(지원·보류)', { selector: 'h3' })).toBeInTheDocument();
    });

    // 토글 끄기
    const toggle = screen.getByRole('checkbox', { name: /미결정 포함/ });
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(capturedInclude).toBe('false');
    });

    // 미결정 그룹 헤더(h3)가 사라져야 함
    await waitFor(() => {
      expect(screen.queryByText('미결정(지원·보류)', { selector: 'h3' })).not.toBeInTheDocument();
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
      expect(screen.getByText('미결정(지원·보류)', { selector: 'h3' })).toBeInTheDocument();
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
      expect(screen.getByText('미결정(지원·보류)', { selector: 'h3' })).toBeInTheDocument();
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
    await waitFor(() => screen.getByText('미결정(지원·보류)', { selector: 'h3' }));
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
    await waitFor(() => screen.getByText('미결정(지원·보류)', { selector: 'h3' }));
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
    await waitFor(() => screen.getByText('미결정(지원·보류)', { selector: 'h3' }));
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
      expect(screen.getByText('미결정(지원·보류)', { selector: 'h3' })).toBeInTheDocument();
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
      expect(screen.getByText('미결정(지원·보류)', { selector: 'h3' })).toBeInTheDocument();
    });
    await userEvent.click(screen.getByRole('checkbox', { name: /김지원 선택/ }));

    // 토글 off — 미결정 목록이 화면에서 사라짐
    const toggle = screen.getByRole('checkbox', { name: /미결정 포함/ });
    await userEvent.click(toggle);

    await waitFor(() => {
      expect(screen.queryByText('미결정(지원·보류)', { selector: 'h3' })).not.toBeInTheDocument();
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
    await waitFor(() => screen.getByText('미결정(지원·보류)', { selector: 'h3' }));
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
});
