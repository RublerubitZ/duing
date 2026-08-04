import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminApplicationDetail } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockApplicationDetailQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminApplicationDetailQuery: (...args: unknown[]) => mockApplicationDetailQuery(...args),
}));

/* ── 대상 ───────────────────────────────────────────────────── */
import {
  AdminApplicationSheet,
  AdminApplicationSheetContent,
} from '@/app/admin/recruitments/_components/AdminApplicationSheet';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeDetail(overrides: Partial<AdminApplicationDetail> = {}): AdminApplicationDetail {
  return {
    applicationId: 31,
    recruitmentId: 5,
    recruitmentTitle: '2026 신입 부원 모집',
    clubId: 10,
    clubName: '두잉코드',
    applicant: {
      name: '정우진',
      studentId: '2023118902',
      college: 'IT_ENGINEERING',
      major: '전자공학과',
    },
    status: 'ACCEPTED',
    submittedAt: '2026-08-01T02:30:00Z',
    statusHistory: [
      { previousStatus: null, newStatus: 'SUBMITTED', changedAt: '2026-08-01T02:31:00Z' },
      { previousStatus: 'SUBMITTED', newStatus: 'ACCEPTED', changedAt: '2026-08-03T05:00:00Z' },
    ],
    answers: [
      { question: '지원 동기를 알려주세요', answer: '함께 만들고 싶어서요' },
      { question: '가능한 활동 요일은?', answer: '' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('관리자 지원서 열람 시트', () => {
  it('어느 동아리의 어느 모집인지 헤더에서 읽힌다', () => {
    render(<AdminApplicationSheetContent detail={makeDetail()} />);

    expect(screen.getByText('두잉코드')).toBeInTheDocument();
    expect(screen.getByText('2026 신입 부원 모집')).toBeInTheDocument();
  });

  it('지원자 신원과 지원일을 보여준다', () => {
    render(<AdminApplicationSheetContent detail={makeDetail()} />);

    expect(screen.getByText('정우진')).toBeInTheDocument();
    expect(screen.getByText('2023118902')).toBeInTheDocument();
    expect(screen.getByText('IT·공과대학 · 전자공학과')).toBeInTheDocument();
    expect(screen.getByText('2026.08.01 11:30')).toBeInTheDocument();
  });

  it('상태 이력을 공용 라벨로 옮겨 시간 순으로 보여준다', () => {
    render(<AdminApplicationSheetContent detail={makeDetail()} />);

    const timeline = screen.getByRole('list', { name: '상태 변경 이력' });
    expect(within(timeline).getByText('지원 완료')).toBeInTheDocument();
    expect(within(timeline).getByText('지원 완료 → 합격')).toBeInTheDocument();
    expect(within(timeline).getByText('2026.08.03 14:00')).toBeInTheDocument();
  });

  it('상태 변경 이력이 없으면 없다고 말한다', () => {
    render(<AdminApplicationSheetContent detail={makeDetail({ statusHistory: [] })} />);

    expect(screen.getByText('상태 변경 이력이 없습니다')).toBeInTheDocument();
  });

  it('질문과 답변을 짝지어 보여준다', () => {
    render(<AdminApplicationSheetContent detail={makeDetail()} />);

    expect(screen.getByText('지원 동기를 알려주세요')).toBeInTheDocument();
    expect(screen.getByText('함께 만들고 싶어서요')).toBeInTheDocument();
  });

  it('답변이 비어 있으면 빈칸 대신 미작성으로 표기한다', () => {
    render(<AdminApplicationSheetContent detail={makeDetail()} />);

    expect(screen.getByText('가능한 활동 요일은?')).toBeInTheDocument();
    expect(screen.getByText('미작성')).toBeInTheDocument();
  });

  it('총동연은 심사 주체가 아니라 상태를 바꿀 수단을 두지 않는다', () => {
    render(<AdminApplicationSheetContent detail={makeDetail()} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  describe('시트 래퍼', () => {
    it('닫으면 상위에 알린다', async () => {
      const user = userEvent.setup();
      const onClose = vi.fn();
      mockApplicationDetailQuery.mockReturnValue({
        data: makeDetail(),
        isLoading: false,
        isSuccess: true,
        isError: false,
        refetch: vi.fn(),
      });

      render(<AdminApplicationSheet applicationId={31} onClose={onClose} />);
      await user.keyboard('{Escape}');

      expect(onClose).toHaveBeenCalled();
    });

    it('조회에 실패하면 다시 시도할 수 있게 안내한다', async () => {
      const refetch = vi.fn();
      mockApplicationDetailQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isSuccess: false,
        isError: true,
        refetch,
      });

      render(<AdminApplicationSheet applicationId={31} onClose={vi.fn()} />);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('지원서를 불러오지 못했어요.');
      await userEvent.setup().click(within(alert).getByRole('button', { name: '다시 시도' }));
      expect(refetch).toHaveBeenCalled();
    });
  });
});
