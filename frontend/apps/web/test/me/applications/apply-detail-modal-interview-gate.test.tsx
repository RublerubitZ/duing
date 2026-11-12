import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ApplicantInterviewView, MyApplicationDetail } from '@duing/types';

import { ToastProvider } from '@/app/_components/toast/ToastProvider';
import { ApplyDetailModal } from '@/app/me/applications/_components/ApplyDetailModal';
import type { App } from '@/app/me/applications/_constants/data';

// 면접을 쓰지 않는 모집이면 서버가 GET /applications/{id}/interview 를 400(InterviewNotUsed)으로 거절하고,
// 전역 재시도 1회까지 붙어 콘솔에 400 이 두 번 찍혔다. 모달·카드 어느 쪽도 켜진 조회를 만들면 안 된다.

const INTERVIEW_VIEW: ApplicantInterviewView = {
  phase: 'AVAILABILITY_REQUESTED',
  availabilityDeadline: null,
  slots: null,
  myAlternativeText: null,
  scheduledInterview: null,
};

// 목은 켜진 조회에만 데이터를 준다 — 실제로는 같은 키라 꺼진 쪽도 캐시를 읽지만, 어느 쪽이 켰는지 가르려고 나눈다.
const myInterviewQuery = vi.fn((_applicationId: number, options?: { enabled?: boolean }) =>
  options?.enabled === false ? { data: undefined, isLoading: false } : { data: INTERVIEW_VIEW, isLoading: false },
);

// 실제 훅 모듈을 그대로 들이면 ApiClientProvider 를 요구한다 — 날짜 헬퍼만 진짜를 쓰고 훅은 대체한다.
vi.mock('@duing/hooks', async () => ({
  ...(await import('@duing/hooks/datetime')),
  useMyInterviewQuery: (applicationId: number, options?: { enabled?: boolean }) => myInterviewQuery(applicationId, options),
  useWithdrawApplicationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}) satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>);

const app: App = {
  id: '42',
  name: '두잉',
  cat: '취미',
  tag: '봄 신입 모집',
  appliedDate: '2026.06.01',
  appliedAt: '2026.06.01 (월) 10:00',
  division: '-',
  department: '-',
  files: [],
  memo: '',
  steps: [],
  status: 'applied',
  right: null,
  logo: { kind: 'wordmark', text: '두', bg: '#2A3828', fg: '#E8EEE8' },
};

function makeDetail(overrides: Partial<MyApplicationDetail>): MyApplicationDetail {
  return {
    id: 42,
    recruitmentId: 7,
    recruitmentTitle: '봄 신입 모집',
    recruitmentStatus: 'OPEN',
    clubId: 3,
    clubName: '두잉',
    questions: [],
    answers: [],
    status: 'INTERVIEW_PENDING',
    interview: null,
    submittedAt: '2026-06-01T01:00:00Z',
    interviewAvailabilityCount: 0,
    availabilityDeadline: null,
    useInterview: true,
    ...overrides,
  };
}

function renderModal(detail: MyApplicationDetail | null) {
  render(
    <ToastProvider>
      <ApplyDetailModal app={app} detail={detail} onClose={vi.fn()} />
    </ToastProvider>,
  );
}

/** 훅 호출마다 받은 enabled — 생략은 훅 기본값(true)이다. */
const enabledFlags = () => myInterviewQuery.mock.calls.map(([, options]) => options?.enabled ?? true);

describe('ApplyDetailModal — 면접 사용 여부로 내 면접 조회를 켠다', () => {
  beforeEach(() => {
    myInterviewQuery.mockClear();
  });

  it.each([['OPEN'], ['CLOSED']] as const)(
    '면접을 쓰지 않는 모집(%s)이면 켜진 조회가 하나도 없고 면접 안내 카드도 없다',
    (recruitmentStatus) => {
      renderModal(makeDetail({ useInterview: false, status: 'SUBMITTED', recruitmentStatus }));

      expect(enabledFlags()).not.toContain(true);
      expect(screen.queryByRole('heading', { name: '면접 안내' })).toBeNull();
    },
  );

  it('상세가 아직 없으면 조회하지 않는다', () => {
    renderModal(null);

    expect(enabledFlags()).not.toContain(true);
  });

  it('면접을 쓰는 마감 모집이면 진행 단계용 모달 조회는 켜고 면접 안내 카드는 올리지 않는다', () => {
    renderModal(makeDetail({ useInterview: true, recruitmentStatus: 'CLOSED' }));

    expect(myInterviewQuery).toHaveBeenCalledWith(42, { enabled: true });
    expect(screen.queryByRole('heading', { name: '면접 안내' })).toBeNull();
  });

  it('면접 사용 모집이면 진행 단계(모달 조회)와 면접 안내 카드(카드 조회)가 모두 보인다', () => {
    renderModal(makeDetail({ useInterview: true }));

    // 진행 단계 안내 문구는 모달 조회의 phase 로만 그려진다.
    expect(screen.getByText('면접 가능 시간을 선택해 주세요.')).toBeInTheDocument();
    // 카드 제목은 카드가 마운트돼 카드 조회가 데이터를 받았을 때만 그려진다.
    expect(screen.getByRole('heading', { name: '면접 안내' })).toBeInTheDocument();
  });
});
