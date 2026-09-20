import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRevealPhone = vi.fn();
vi.mock('@duing/hooks', async (importOriginal) => ({
  // formatDateTimeKst 등 순수 함수는 실제 구현 그대로 — 부분 mock 은 열람 훅만 바꾼다.
  ...(await importOriginal<typeof import('@duing/hooks')>()),
  useApplicantPhoneMutation: () => ({ mutateAsync: mockRevealPhone, isPending: false }),
}));

import { ApplicantProfilePanel } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/ApplicantProfilePanel';

import type { ApplicantDetail } from '@duing/types';

const detailFixture: ApplicantDetail = {
  applicationId: 1,
  recruitmentId: 2,
  recruitmentTitle: '2026 상반기 신입 모집',
  clubId: 3,
  clubName: '두잉',
  applicant: {
    userId: 10,
    name: '김민지',
    studentId: '20231234',
    college: 'IT_ENGINEERING',
    major: '컴퓨터정보공학부',
    grade: 'SOPHOMORE',
    phoneMasked: '010-****-5678',
  },
  answers: [],
  status: 'SUBMITTED',
  interview: null,
  submittedAt: '2026-06-01T09:05:00',
  myEvaluation: null,
  otherEvaluations: [],
  statusHistory: [],
  interviewAvailabilities: [],
  assignedSlot: null,
  interviewRound: null,
};

beforeEach(() => {
  mockRevealPhone.mockReset();
});

describe('ApplicantProfilePanel', () => {
  it('지원자 기본 정보를 렌더한다', () => {
    render(<ApplicantProfilePanel detail={detailFixture} />);

    expect(screen.getByRole('heading', { name: '지원자 정보' })).toBeInTheDocument();
    expect(screen.getByText('김민지')).toBeInTheDocument();
    expect(screen.getByText('IT·공과대학 · 컴퓨터정보공학부')).toBeInTheDocument();
  });

  /* 320px 에서 '단과대 · 전공' 결합 문자열이 고정 2열(50%)에 갇혀 넘치던 문제.
   * jsdom 은 레이아웃을 모르니 클래스로 못박는다. */
  it('프로필 dl 은 라벨 자동폭 그리드이고 값 셀은 줄바꿈된다', () => {
    const { container } = render(<ApplicantProfilePanel detail={detailFixture} />);

    const definitionList = container.querySelector('dl');
    expect(definitionList?.className).toContain('grid-cols-[auto_minmax(0,1fr)]');

    const valueCell = container.querySelector('dd');
    expect(valueCell?.className).toContain('break-words');
  });

  it('모든 값 셀에 break-words 가 걸려 긴 값도 갇히지 않는다', () => {
    const { container } = render(
      <ApplicantProfilePanel
        detail={{
          ...detailFixture,
          interview: {
            startAt: '2026-06-13T18:00:00',
            endAt: '2026-06-13T18:30:00',
            location: '공학관 401호 세미나실',
          },
        }}
      />,
    );

    const valueCells = Array.from(container.querySelectorAll('dd'));
    expect(valueCells.length).toBeGreaterThan(0);
    for (const cell of valueCells) {
      expect(cell.className).toContain('break-words');
    }
  });

  // 휴대폰은 상세 응답에 마스킹으로만 온다 — 원본은 [번호 보기] 를 눌러 열람 API(감사 기록)로만 받는다.
  it('번호가 없는 지원자(phoneMasked null)는 빈 값만 보이고 [휴대폰 번호 보기] 버튼이 없다', () => {
    render(
      <ApplicantProfilePanel
        detail={{ ...detailFixture, applicant: { ...detailFixture.applicant, phoneMasked: null } }}
      />,
    );
    expect(screen.queryByRole('button', { name: '휴대폰 번호 보기' })).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('휴대폰은 마스킹으로 보이고 [휴대폰 번호 보기] 버튼이 있다', () => {
    render(<ApplicantProfilePanel detail={detailFixture} />);

    expect(screen.getByText('010-****-5678')).toBeInTheDocument();
    expect(screen.queryByText('010-1234-5678')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '휴대폰 번호 보기' })).toBeInTheDocument();
  });

  it('[휴대폰 번호 보기]를 누르면 열람 API 로 받은 원본을 표시하고 버튼은 사라진다', async () => {
    mockRevealPhone.mockResolvedValue({ phone: '010-1234-5678' });
    const user = userEvent.setup();
    render(<ApplicantProfilePanel detail={detailFixture} />);

    await user.click(screen.getByRole('button', { name: '휴대폰 번호 보기' }));

    expect(await screen.findByText('010-1234-5678')).toBeInTheDocument();
    expect(mockRevealPhone).toHaveBeenCalledWith(1);
    expect(screen.queryByRole('button', { name: '휴대폰 번호 보기' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '연락처 복사' })).toBeInTheDocument();
  });
});
