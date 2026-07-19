import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidatesResponse } from '@duing/types';

const mockCandidatesQuery = vi.fn();
const mockUsageQuery = vi.fn();
const mockCreateMutation = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@duing/hooks', () => ({
  useSubmissionCandidatesQuery: (...args: unknown[]) => mockCandidatesQuery(...args),
  useFacilityUsageQuery: () => mockUsageQuery(),
  useCreateSubmissionBatchMutation: () => mockCreateMutation(),
}));
vi.mock('../../../app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { AdminSubmissionPage } from '../../../app/admin/facility-bookings/submission/_pages/AdminSubmissionPage';

function makeResponse(): SubmissionCandidatesResponse {
  return {
    summary: { approvedCount: 2, awaitingCount: 1, submittedCount: 1, confirmedCount: 1 },
    bookings: [
      {
        bookingId: 1, clubId: 10, clubName: '밴드부', applicantName: '홍길동', contactPhone: '010-1234-5678',
        reservationDate: '2026-08-01', startTime: '18:00', endTime: '21:00', purpose: '정기 합주',
        attendeeCount: 30, status: 'APPROVED', submitted: false, selectable: true,
        submissionNo: null, decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
      {
        bookingId: 2, clubId: 11, clubName: '방송국', applicantName: '김철수', contactPhone: null,
        reservationDate: '2026-08-02', startTime: '09:00', endTime: '10:00', purpose: '연습',
        attendeeCount: null, status: 'CONFIRMED', submitted: true, selectable: false,
        submissionNo: 'SUB-20260801-001', decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
    ],
  };
}

const querySuccess = (response: SubmissionCandidatesResponse) => ({
  data: response, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn(),
});
const queryIdle = { data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() };

describe('AdminSubmissionPage', () => {
  beforeEach(() => {
    mockCandidatesQuery.mockReset();
    mockUsageQuery.mockReset();
    mockCreateMutation.mockReset();
    mockAddToast.mockReset();
    mockUsageQuery.mockReturnValue({ data: { facilities: [{ id: 100, roomName: '커뮤니티룸(1)' }] } });
    mockCandidatesQuery.mockReturnValue(queryIdle);
    mockCreateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
  });

  function selectFacility() {
    fireEvent.change(screen.getByLabelText('시설 선택'), { target: { value: '100' } });
  }

  it('시설을 선택하기 전에는 안내가 보이고 후보 쿼리는 null 파라미터로 비활성이다', () => {
    render(<AdminSubmissionPage />);

    // 안내 문구('먼저 시설을 선택')는 셀렉트 placeholder('시설을 선택하세요')와 겹치지 않게 고유 어절로 조회.
    expect(screen.getByText(/먼저 시설을 선택/)).toBeInTheDocument();
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('시설 선택 시 기간(기본 이번 달)과 함께 조회하고 v2 라벨의 Summary 4카드를 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);

    selectFacility();

    const lastParams = mockCandidatesQuery.mock.calls.at(-1)?.[0] as { facilityId: number; startDate: string };
    expect(lastParams.facilityId).toBe(100);
    expect(lastParams.startDate.endsWith('-01')).toBe(true);
    // 카드 라벨은 상태 배지(SUBMISSION_STATUS_LABELS)·셀렉트 옵션과 문자열이 겹쳐 role=button 으로 카드만 조회.
    // '승인 완료' 는 '제출 필요' 카드의 sub 문구에도 등장하므로 ^ 앵커로 라벨 위치를 고정.
    expect(screen.getByRole('button', { name: /^승인 완료/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /제출 필요/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /제출함/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /학교 등록 완료/ })).toBeInTheDocument();
  });

  it('기본 뷰는 동아리 그룹 목록이고 시간표는 토글로 전환된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();

    // 기본 = 그룹 목록(그룹 헤더 존재)
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '시간표' }));
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
  });

  it('동아리명 부분 검색이 그룹 목록을 좁힌다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();

    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '방송' } });

    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();
  });

  it('제출 여부 셀렉트(제출 필요/제출함)와 카드 클릭이 같은 필터를 조작한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<AdminSubmissionPage />);
    selectFacility();

    fireEvent.change(screen.getByLabelText('제출 여부'), { target: { value: 'SUBMITTED' } });
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();

    // 제출함 카드 재클릭 = 전체 복귀
    fireEvent.click(screen.getByRole('button', { name: /제출함/ }));
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
  });

  it('기간이 31일을 넘으면 조회하지 않고 안내를 보여준다', () => {
    render(<AdminSubmissionPage />);
    selectFacility();
    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-09-05' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/31일/);
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('제출 이력 탭은 준비 중 안내를 보여준다', () => {
    render(<AdminSubmissionPage />);

    fireEvent.click(screen.getByRole('tab', { name: '제출 이력' }));
    expect(screen.getByText(/준비 중/)).toBeInTheDocument();
  });
});
