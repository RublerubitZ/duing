import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubmissionCandidatesResponse } from '@duing/types';

const mockCandidatesQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useSubmissionCandidatesQuery: (...args: unknown[]) => mockCandidatesQuery(...args),
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

const querySuccess = (response: SubmissionCandidatesResponse) => ({
  data: response, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn(),
});
const queryIdle = { data: undefined, isLoading: false, isSuccess: false, isError: false, refetch: vi.fn() };

/** 시설별 섹션 <li> — 같은 라벨의 "학교 제출하기" 버튼이 여러 섹션에 있어 섹션 단위로 좁혀 조회한다. */
function sectionOf(facilityName: string): HTMLElement {
  const section = screen.getByRole('heading', { name: facilityName }).closest('li');
  if (section === null) throw new Error(`섹션(${facilityName})을 찾지 못했습니다`);
  return section;
}

describe('SubmissionPrepareTab', () => {
  beforeEach(() => {
    mockCandidatesQuery.mockReset();
    mockCandidatesQuery.mockReturnValue(queryIdle);
  });

  it('진입 즉시 시설 없이 전 시설 후보를 조회한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const lastParams = mockCandidatesQuery.mock.calls.at(-1)?.[0];
    expect(lastParams.facilityId).toBeUndefined();
    expect(lastParams.startDate.endsWith('-01')).toBe(true);
  });

  it('시설별 섹션이 렌더되고 헤더에 제출할 예약 수가 보인다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    expect(screen.getByRole('heading', { name: '강당' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '세미나실' })).toBeInTheDocument();
    expect(screen.getByText(/학교에 제출할 예약 1건/)).toBeInTheDocument();
  });

  it('제출 필요 예약은 기본 전체 선택이고, 체크 해제는 제외로 동작한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    const rowCheckbox = screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ });
    const dangSubmitButton = () => within(sectionOf('강당')).getByRole('button', { name: /학교 제출하기/ });
    expect(rowCheckbox).toBeChecked();
    expect(dangSubmitButton()).toHaveTextContent('학교 제출하기 (1건)');
    expect(dangSubmitButton()).toBeEnabled();

    fireEvent.click(rowCheckbox);
    expect(rowCheckbox).not.toBeChecked();
    expect(dangSubmitButton()).toHaveTextContent('학교 제출하기 (0건)');
    expect(dangSubmitButton()).toBeDisabled();
  });

  it('검색으로 화면에서 사라진 예약의 제외 상태는 정리된다 — 검색 해제 시 기본 선택으로 복귀', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 제외 → 검색으로 해당 예약을 숨김 → 검색 해제 → 제외가 정리되어 다시 기본 선택
    fireEvent.click(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ }));
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '방송' } });
    fireEvent.change(screen.getByLabelText('동아리 검색'), { target: { value: '' } });

    expect(screen.getByRole('checkbox', { name: /밴드부 2026-08-01 18:00 선택/ })).toBeChecked();
  });

  it('전 시설 합산 Summary 4카드를 v2.2 라벨로 보여준다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    // 카드 라벨은 상태 배지·셀렉트 옵션·섹션 헤더와 문자열이 겹쳐 role=button(aria-pressed 카드)으로 조회.
    // '학교에 제출할 예약'은 셀렉트 옵션·섹션 헤더와 겹쳐 카드 sub 문구로 고정 조회.
    expect(screen.getByRole('button', { name: /^승인 완료/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /아직 제출 목록에 담기지 않은 예약/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /제출 목록에 담김/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /학교 등록 완료/ })).toBeInTheDocument();
  });

  it('제출 상태 셀렉트와 카드 클릭이 같은 필터를 조작한다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    fireEvent.change(screen.getByLabelText('제출 상태'), { target: { value: 'SUBMITTED' } });
    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /방송국/ })).toBeInTheDocument();

    // 제출 목록에 담김 카드 재클릭 = 전체 복귀
    fireEvent.click(screen.getByRole('button', { name: /제출 목록에 담김/ }));
    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();
  });

  it('동아리명 부분 검색이 그룹 목록을 좁힌다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

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

  it('시간표 토글 시 섹션 안에 시간표가 렌더된다', () => {
    mockCandidatesQuery.mockReturnValue(querySuccess(makeResponse()));
    render(<SubmissionPrepareTab />);

    expect(screen.getByRole('group', { name: /밴드부/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: '시간표' }));

    expect(screen.queryByRole('group', { name: /밴드부/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: '09' }).length).toBeGreaterThan(0);
  });
});
