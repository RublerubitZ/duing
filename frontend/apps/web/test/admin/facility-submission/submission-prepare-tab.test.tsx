import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidatesResponse } from '@duing/types';

const mockCandidatesQuery = vi.fn();
const mockCreateMutation = vi.fn();
const mockCsvMutateAsync = vi.fn();
const mockDownloadBlobFile = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@duing/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useSubmissionCandidatesQuery: (...args: unknown[]) => mockCandidatesQuery(...args),
  useCreateSubmissionBatchMutation: () => mockCreateMutation(),
  // 생성 결과 다이얼로그의 CSV 바로 받기용 — 실 blob 다운로드는 jsdom 에서 불가해 스텁한다.
  useDownloadSubmissionCsvMutation: () => ({ mutateAsync: mockCsvMutateAsync, isPending: false, variables: undefined }),
}));

vi.mock('@/app/_lib/downloadFile', () => ({
  downloadBlobFile: (...args: unknown[]) => mockDownloadBlobFile(...args),
}));

vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { SubmissionPrepareTab } from '../../../app/admin/facility-bookings/_tabs/SubmissionPrepareTab';

function makeResponse(): SubmissionCandidatesResponse {
  return {
    summary: { approvedCount: 2, awaitingCount: 1, submittedCount: 1, confirmedCount: 1 },
    bookings: [
      {
        bookingId: 1, facilityId: 100, facilityName: '강당', clubId: 10, clubName: '밴드부', applicantName: '홍길동', contactPhone: '010-1234-5678',
        reservationDate: '2026-08-01', startTime: '18:00', endTime: '21:00', purpose: '정기 합주',
        attendeeCount: 30, status: 'APPROVED', submitted: false, selectable: true,
        submissionNo: null, decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
      {
        bookingId: 2, facilityId: 200, facilityName: '세미나실', clubId: 11, clubName: '방송국', applicantName: '김철수', contactPhone: null,
        reservationDate: '2026-08-02', startTime: '09:00', endTime: '10:00', purpose: '연습',
        attendeeCount: null, status: 'CONFIRMED', submitted: true, selectable: false,
        submissionNo: 'SUB-20260801-001', decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
    ],
  };
}

/**
 * 동아리 단위 생성 픽스처(v2 스펙 §4) — makeResponse() 에 밴드부의 세미나실 예약(다시설)과
 * 테니스부 예약을 추가한다. 밴드부(강당+세미나실)는 한 호출에 담기고, 생성은 동아리별 2회여야 한다.
 */
function makeMultiClubResponse(): SubmissionCandidatesResponse {
  const base = makeResponse();
  return {
    summary: { ...base.summary, approvedCount: base.summary.approvedCount + 2, awaitingCount: base.summary.awaitingCount + 2 },
    bookings: [
      ...base.bookings,
      {
        bookingId: 3, facilityId: 200, facilityName: '세미나실', clubId: 10, clubName: '밴드부', applicantName: '홍길동', contactPhone: '010-1234-5678',
        reservationDate: '2026-08-03', startTime: '14:00', endTime: '16:00', purpose: '앰프 점검',
        attendeeCount: 5, status: 'APPROVED', submitted: false, selectable: true,
        submissionNo: null, decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
      {
        bookingId: 4, facilityId: 100, facilityName: '강당', clubId: 12, clubName: '테니스부', applicantName: '이영희', contactPhone: '010-9999-8888',
        reservationDate: '2026-08-04', startTime: '10:00', endTime: '12:00', purpose: '정기 연습',
        attendeeCount: 15, status: 'APPROVED', submitted: false, selectable: true,
        submissionNo: null, decidedByName: '관리자', decidedAt: '2026-07-20T10:00:00',
      },
    ],
  };
}

const querySuccess = (response: SubmissionCandidatesResponse) => ({
  data: response, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn(),
});
const queryIdle = { data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() };
const queryLoading = { data: undefined, isLoading: true, isSuccess: false, isError: false, refetch: vi.fn() };

/** 조회 기간을 명시 지정한다 — 픽스처 예약일(2026-08)과 기간의 포함 관계가 정리 규칙에 영향을 주므로 오늘 날짜에 기대지 않는다. */
function setPeriod(startDate: string, endDate: string) {
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: startDate } });
  fireEvent.change(screen.getByLabelText('종료일'), { target: { value: endDate } });
}

/** 밴드부 강당 예약(1)을 뺀 다른 달 결과 — 기간 변경 시 서버가 돌려주는 "예약일 밖" 목록. */
function makeSeptemberResponse(): SubmissionCandidatesResponse {
  return {
    summary: { approvedCount: 1, awaitingCount: 1, submittedCount: 0, confirmedCount: 0 },
    bookings: [
      {
        bookingId: 5, facilityId: 100, facilityName: '강당', clubId: 12, clubName: '테니스부', applicantName: '이영희', contactPhone: '010-9999-8888',
        reservationDate: '2026-09-05', startTime: '10:00', endTime: '12:00', purpose: '9월 연습',
        attendeeCount: 15, status: 'APPROVED', submitted: false, selectable: true,
        submissionNo: null, decidedByName: '관리자', decidedAt: '2026-08-20T10:00:00',
      },
    ],
  };
}

describe('SubmissionPrepareTab', () => {
  beforeEach(() => {
    mockCandidatesQuery.mockReset();
    mockCandidatesQuery.mockReturnValue(queryIdle);
    mockCreateMutation.mockReset();
    mockCreateMutation.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    mockCsvMutateAsync.mockReset();
    mockDownloadBlobFile.mockReset();
    mockAddToast.mockReset();
  });

  it('진입 즉시 시설 없이 전 시설 후보를 조회한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const lastParams = mockCandidatesQuery.mock.calls.at(-1)?.[0];
    expect(lastParams.facilityId).toBeUndefined();
    expect(lastParams.startDate.endsWith('-01')).toBe(true);
  });

  it('기본은 미제출 예약만 보여주고, 제출 대기(submitted)로 이동한 예약은 숨긴다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 밴드부(미제출·강당)는 보이고, 방송국(제출된 세미나실)은 기본 목록에서 빠진다.
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
    expect(screen.getByText('강당')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /방송국/ })).not.toBeInTheDocument();
    expect(screen.queryByText('세미나실')).not.toBeInTheDocument();
    expect(screen.getByText(/시설 1곳 · 1건 · 선택 1/)).toBeInTheDocument();
  });

  it('전체 보기로 바꾸면 제출 대기 예약이 있는 동아리 그룹도 함께 보인다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'ALL' } });

    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
    expect(screen.getByText('강당')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();
    expect(screen.getByText('세미나실')).toBeInTheDocument();
  });

  it('제출 필요 예약은 기본 전체 선택이고, 체크 해제는 제외로 동작해 요약 바에 반영된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const rowCheckbox = screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ });
    const createBarButton = () => screen.getByRole('button', { name: /^제출 목록 만들기/ });
    expect(rowCheckbox).toBeChecked();
    expect(screen.getByText('1건 선택됨 · 동아리 1곳')).toBeInTheDocument();
    expect(createBarButton()).toBeEnabled();

    fireEvent.click(rowCheckbox);
    expect(rowCheckbox).not.toBeChecked();
    expect(screen.getByText('0건 선택됨')).toBeInTheDocument();
    expect(createBarButton()).toBeDisabled();
  });

  it('그룹 헤더 전체 선택 체크박스를 다시 클릭하면 제외된 예약이 전원 재선택된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const rowCheckbox = screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ });
    const groupCheckbox = screen.getByRole('checkbox', { name: '밴드부 전체 선택' });

    fireEvent.click(rowCheckbox);
    expect(rowCheckbox).not.toBeChecked();
    expect(groupCheckbox).not.toBeChecked();
    expect(screen.getByText('0건 선택됨')).toBeInTheDocument();

    fireEvent.click(groupCheckbox);
    expect(rowCheckbox).toBeChecked();
    expect(groupCheckbox).toBeChecked();
    expect(screen.getByText('1건 선택됨 · 동아리 1곳')).toBeInTheDocument();
  });

  it('요약 바의 전체 해제·전체 선택이 보이는 selectable 예약 전체에 작용한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeMultiClubResponse()));
    render(<SubmissionPrepareTab />);

    expect(screen.getByText('3건 선택됨 · 동아리 2곳')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체 해제' }));
    expect(screen.getByText('0건 선택됨')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '전체 선택' }));
    expect(screen.getByText('3건 선택됨 · 동아리 2곳')).toBeInTheDocument();
  });

  // ── 제외 상태 보존(P2-15/20) — 검색·상태 필터·기간 변경으로 숨겨진 제외는 유지하고, 서버 결과에서 실제 사라진 것만 정리한다. ──

  it('검색으로 숨겨진 예약의 제외 상태는 유지된다 — 검색 해제 후에도 제외 표시', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '방송' } });
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '' } });

    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).not.toBeChecked();
    expect(screen.getByText('0건 선택됨')).toBeInTheDocument();
  });

  it('상태 필터 전환으로 숨겨진 예약의 제외 상태는 유지된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'SUBMITTED' } });
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'NEED' } });

    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).not.toBeChecked();
    expect(screen.getByText('0건 선택됨')).toBeInTheDocument();
  });

  it('기간 변경으로 예약일 밖이 된 제외는 유지되고, 기간 복귀(로딩 경유) 후에도 제외 표시', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    const { rerender } = render(<SubmissionPrepareTab />);
    setPeriod('2026-08-01', '2026-08-31');

    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));

    // 9월로 이동 — 서버 결과에 예약 1 이 없지만 예약일(08-01)이 기간 밖이라 "기간 변경으로 숨겨진 것".
    mockCandidatesQuery.mockReturnValue(querySuccess(makeSeptemberResponse()));
    setPeriod('2026-09-01', '2026-09-30');
    expect(screen.getByRole('group', { name: /테니스부/ })).toBeInTheDocument();

    // 8월 복귀 — 새 키 로딩 중(data 없음)에 정리하면 안 되고, 결과가 도착해 예약 1 이 다시 있으면 제외 유지.
    mockCandidatesQuery.mockReturnValue(queryLoading);
    setPeriod('2026-08-01', '2026-08-31');
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    rerender(<SubmissionPrepareTab />);

    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).not.toBeChecked();
    expect(screen.getByText('0건 선택됨')).toBeInTheDocument();
  });

  it('서버 재조회 결과에서 기간 안 예약이 사라지면 제외를 정리한다 — 다시 나타나면 기본 선택', () => {
    const fullResponse = makeMultiClubResponse();
    mockCandidatesQuery.mockReturnValue(querySuccess(fullResponse));
    const { rerender } = render(<SubmissionPrepareTab />);
    setPeriod('2026-08-01', '2026-08-31');

    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    expect(screen.getByText('2건 선택됨 · 동아리 2곳')).toBeInTheDocument();

    // 예약 1 이 서버 결과에서 빠짐(기간 안) → 실제 소실로 보고 제외 정리.
    mockCandidatesQuery.mockReturnValue(
      querySuccess({ ...fullResponse, bookings: fullResponse.bookings.filter((booking) => booking.bookingId !== 1) }),
    );
    rerender(<SubmissionPrepareTab />);
    expect(screen.queryByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).not.toBeInTheDocument();

    mockCandidatesQuery.mockReturnValue(querySuccess(fullResponse));
    rerender(<SubmissionPrepareTab />);
    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).toBeChecked();
    expect(screen.getByText('3건 선택됨 · 동아리 2곳')).toBeInTheDocument();
  });

  it('일부만 제외한 뒤 검색·필터를 거쳐도 제외/선택 구분이 그대로 보존된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeMultiClubResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '밴드' } });
    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-03 14:00 선택/ })).toBeChecked();

    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'SUBMITTED' } });
    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'NEED' } });
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '' } });

    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-03 14:00 선택/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /테니스부 2026-08-04 10:00 선택/ })).toBeChecked();
    expect(screen.getByText('2건 선택됨 · 동아리 2곳')).toBeInTheDocument();
  });

  it('검색으로 숨겼다 해제한 제외 예약은 제출 목록 생성 payload 에 포함되지 않는다', async () => {
    const createMutateAsync = vi.fn().mockResolvedValue({
      batchId: 10, submissionNo: 'SUB-20260801-005', csvFileName: 'facility-submission-SUB-20260801-005.csv',
    });
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeMultiClubResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '테니스' } });
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: '제출 목록 만들기 (2개 동아리)' }));
    fireEvent.click(screen.getByRole('button', { name: '목록 만들기' }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledTimes(2);
    });
    // 밴드부는 세미나실(3)만, 테니스부는 4 — 제외한 강당(1)은 어느 호출에도 없다.
    expect(createMutateAsync.mock.calls.map(([payload]) => payload.bookingIds)).toEqual([[3], [4]]);
  });

  it('전 시설 합산 Summary 4카드를 v2.2 라벨로 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 카드 라벨은 상태 배지·셀렉트 옵션·섹션 헤더와 문자열이 겹쳐 role=button(aria-pressed 카드)으로 조회.
    // '미제출 예약'은 셀렉트 옵션·섹션 헤더와 겹쳐 카드 sub 문구로 고정 조회.
    expect(screen.getByRole('button', { name: /^승인 완료/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /아직 제출 목록에 포함되지 않은 예약/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /제출 대기 예약/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /학교 등록 완료/ })).toBeInTheDocument();
  });

  it('제출 상태 셀렉트와 카드 클릭이 같은 필터를 조작한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'SUBMITTED' } });
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();

    // 제출 대기 예약 카드 재클릭 = 전체 복귀
    fireEvent.click(screen.getByRole('button', { name: /제출 대기 예약/ }));
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
  });

  it('동아리명 부분 검색이 그룹 목록을 좁힌다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 방송국은 제출 대기(submitted)라 기본(미제출) 뷰에선 숨겨져 있으므로 전체 보기로 바꿔 검색을 검증한다.
    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'ALL' } });
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '방송' } });

    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();
  });

  it('기간이 31일을 넘으면 조회하지 않고 안내를 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('종료일'), { target: { value: '2026-09-05' } });

    expect(screen.getByRole('alert')).toHaveTextContent(/31일/);
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('시작일이 빈 값이면(NaN 일수) 조회하지 않고 안내를 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '' } });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(mockCandidatesQuery).toHaveBeenLastCalledWith(null);
  });

  it('시간표 토글 시 시설 섹션 헤더와 시간표가 렌더된다 — 시간표 뷰는 시설 기준 유지', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 목록 뷰는 동아리 최상위 — 시설 sage 밴드(heading)는 없다.
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '강당' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '시간표' }));

    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '강당' })).toBeInTheDocument();
    expect(screen.getByText(/미제출 예약 1건 · 선택 1건/)).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: '09' }).length).toBeGreaterThan(0);
  });

  it('일괄 생성: 메모 프리필을 고쳐 확정하면 동아리별 예약으로 생성되고 결과에서 CSV 를 바로 받는다', async () => {
    const createMutateAsync = vi.fn().mockResolvedValue({
      batchId: 7, submissionNo: 'SUB-20260801-002', csvFileName: 'facility-submission-SUB-20260801-002.csv',
    });
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCsvMutateAsync.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('button', { name: /^제출 목록 만들기/ }));
    expect(screen.getByText('제출 목록을 만들까요?')).toBeInTheDocument();

    // 메모는 "M월 N주차 · 동아리명" 프리필(수정 가능) — 절대 날짜 대신 오늘 기준으로 계산해 단언한다.
    const today = new Date();
    const expectedPrefill = `${today.getMonth() + 1}월 ${Math.ceil(today.getDate() / 7)}주차 · 밴드부`;
    const memoInput = screen.getByLabelText('밴드부 메모');
    expect(memoInput).toHaveValue(expectedPrefill);
    fireEvent.change(memoInput, { target: { value: '8월 1차' } });
    fireEvent.click(screen.getByRole('button', { name: '목록 만들기' }));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith({ bookingIds: [1], memo: '8월 1차' });
    });

    // 생성 결과 다이얼로그 — 제출번호·CSV 바로 받기·제출 대기 이동
    expect(await screen.findByText('제출 목록 1개가 만들어졌어요')).toBeInTheDocument();
    // 제출 대기로 이동한 건수를 토스트로 알린다(목록에서 사라진 이유를 직관적으로).
    expect(mockAddToast).toHaveBeenCalledWith(
      '제출 목록이 생성되었습니다. 선택한 1건의 예약이 제출 대기로 이동했습니다.',
    );
    expect(screen.getByText(/SUB-20260801-002/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '제출 대기로 이동' })).toHaveAttribute(
      'href',
      expect.stringContaining('?tab=ready'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'CSV 받기' }));
    await waitFor(() => {
      expect(mockCsvMutateAsync).toHaveBeenCalledWith({ batchId: 7 });
      expect(mockDownloadBlobFile).toHaveBeenCalledWith(
        'facility-submission-SUB-20260801-002.csv',
        expect.any(Blob),
      );
    });
  });

  it('여러 동아리 선택 시 동아리별로 순차 생성한다 — 한 동아리의 다시설 예약은 한 호출에 담긴다', async () => {
    const createMutateAsync = vi.fn().mockResolvedValue({
      batchId: 8, submissionNo: 'SUB-20260801-003', csvFileName: 'facility-submission-SUB-20260801-003.csv',
    });
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeMultiClubResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('button', { name: '제출 목록 만들기 (2개 동아리)' }));
    expect(screen.getByText('제출 목록 2개를 만들까요?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목록 만들기' }));

    const today = new Date();
    const weekPrefix = `${today.getMonth() + 1}월 ${Math.ceil(today.getDate() / 7)}주차`;
    await waitFor(() => {
      // 밴드부의 강당(1)+세미나실(3) 예약이 한 호출에 담긴다 — 다시설 배치(v2 스펙 §1).
      expect(createMutateAsync).toHaveBeenNthCalledWith(1, { bookingIds: [1, 3], memo: `${weekPrefix} · 밴드부` });
      expect(createMutateAsync).toHaveBeenNthCalledWith(2, { bookingIds: [4], memo: `${weekPrefix} · 테니스부` });
    });
  });

  it('일부 동아리 생성 실패 시 결과 다이얼로그에 동아리별 성공·실패가 구분 표기된다', async () => {
    const createMutateAsync = vi
      .fn()
      .mockRejectedValueOnce(new Error('이미 제출된 예약이 포함되어 있습니다.'))
      .mockResolvedValueOnce({
        batchId: 9, submissionNo: 'SUB-20260801-004', csvFileName: 'facility-submission-SUB-20260801-004.csv',
      });
    mockCreateMutation.mockReturnValue({ mutateAsync: createMutateAsync, isPending: false });
    mockCandidatesQuery.mockReturnValue(querySuccess(makeMultiClubResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.click(screen.getByRole('button', { name: '제출 목록 만들기 (2개 동아리)' }));
    fireEvent.click(screen.getByRole('button', { name: '목록 만들기' }));

    // 결과 다이얼로그는 동아리명 기준 행 — 페이지 뒤 동아리 그룹 헤더와 겹치지 않게 다이얼로그 안에서 조회.
    expect(await screen.findByText('일부 제출 목록을 만들지 못했어요')).toBeInTheDocument();
    const resultDialog = screen.getByRole('dialog');
    expect(within(resultDialog).getByText('밴드부')).toBeInTheDocument();
    expect(within(resultDialog).getByText('테니스부')).toBeInTheDocument();
    expect(screen.getByText('이미 제출된 예약이 포함되어 있습니다.')).toBeInTheDocument();
    expect(screen.getByText(/SUB-20260801-004/)).toBeInTheDocument();

    // 실패해도 excluded 는 건드리지 않는다 — 닫은 뒤 실패 동아리(밴드부) 예약이 선택 유지되어 바로 재시도 가능.
    // (성공 동아리의 이탈은 실제 재조회가 담당 — 이 테스트의 candidates 목은 정적이라 그 경로는 다루지 않는다.)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).toBeChecked();
    expect(screen.getByText('3건 선택됨 · 동아리 2곳')).toBeInTheDocument();
  });
});
