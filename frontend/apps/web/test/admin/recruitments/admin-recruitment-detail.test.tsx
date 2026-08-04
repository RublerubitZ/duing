import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AdminJoinLinkStatus, AdminRecruitmentDetail } from '@duing/types';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
const mockDetailQuery = vi.fn();
const mockForceClose = vi.fn();
// 자체 지원 모집이면 지원자 패널이 함께 붙는다 — 패널이 쓰는 훅까지 대체해야 상세 화면이 렌더된다.
const mockApplicantsQuery = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminRecruitmentDetailQuery: (...args: unknown[]) => mockDetailQuery(...args),
  useForceCloseRecruitmentMutation: () => ({ mutate: mockForceClose, isPending: false }),
  useAdminApplicantsQuery: (...args: unknown[]) => mockApplicantsQuery(...args),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
  useOptionalToast: () => vi.fn(),
}));

const { MockApiError } = vi.hoisted(() => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message = 'api error') {
      super(message);
      this.status = status;
      this.name = 'ApiError';
    }
  }
  return { MockApiError };
});
vi.mock('@duing/api', () => ({ ApiError: MockApiError }));

/* ── 대상 ───────────────────────────────────────────────────── */
import { AdminRecruitmentDetailPage } from '@/app/admin/recruitments/_pages/AdminRecruitmentDetailPage';

/* ── 테스트 데이터 ───────────────────────────────────────────── */
function makeJoinLink(overrides: Partial<AdminJoinLinkStatus> = {}): AdminJoinLinkStatus {
  return {
    linkStatus: 'ACTIVE',
    generation: 12,
    maxUses: 40,
    usedCount: 12,
    totalRequestCount: 12,
    pendingCount: 3,
    enrolledCount: 9,
    joinWindowDays: 14,
    joinExpiresAt: null,
    ...overrides,
  };
}

function makeDetail(overrides: Partial<AdminRecruitmentDetail> = {}): AdminRecruitmentDetail {
  return {
    recruitmentId: 5,
    clubId: 10,
    clubName: '두잉코드',
    title: '2026 신입 부원 모집',
    applicationMode: 'SELF',
    status: 'OPEN',
    applicantCount: 12,
    startDate: '2026-03-02',
    endDate: '2026-03-20',
    updatedAt: '2026-08-01T02:30:00Z',
    externalFormUrl: null,
    joinLink: null,
    ...overrides,
  };
}

function detailSuccess(detail: AdminRecruitmentDetail) {
  return { data: detail, isLoading: false, isSuccess: true, isError: false, refetch: vi.fn() };
}

function externalDetail(overrides: Partial<AdminRecruitmentDetail> = {}): AdminRecruitmentDetail {
  return makeDetail({
    applicationMode: 'EXTERNAL',
    applicantCount: null,
    externalFormUrl: 'https://forms.gle/abc123',
    joinLink: makeJoinLink(),
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDetailQuery.mockReturnValue(detailSuccess(makeDetail()));
  mockApplicantsQuery.mockReturnValue({
    data: { total: 0, statusCounts: {}, applicants: [] },
    isLoading: false,
    isSuccess: true,
    isError: false,
    refetch: vi.fn(),
  });
});

describe('관리자 모집 상세', () => {
  it('공통 메타로 동아리·제목·상태를 보여준다', () => {
    render(<AdminRecruitmentDetailPage recruitmentId={5} />);

    expect(screen.getByText('두잉코드')).toBeInTheDocument();
    expect(screen.getByText('2026 신입 부원 모집')).toBeInTheDocument();
    expect(screen.getByText('모집중')).toBeInTheDocument();
  });

  it('마감된 모집에는 강제 마감 버튼을 두지 않는다', () => {
    mockDetailQuery.mockReturnValue(detailSuccess(makeDetail({ status: 'CLOSED' })));

    render(<AdminRecruitmentDetailPage recruitmentId={5} />);

    expect(screen.queryByRole('button', { name: '강제 마감' })).toBeNull();
  });

  it('자체 지원 모집에는 외부 모집 안내 대신 지원자 패널을 붙인다', () => {
    render(<AdminRecruitmentDetailPage recruitmentId={5} />);

    expect(screen.queryByText(/외부 모집은 두잉에서 지원서를 관리하지 않습니다/)).toBeNull();
    expect(mockApplicantsQuery).toHaveBeenCalledWith(5, expect.anything());
  });

  describe('외부 폼 모집', () => {
    it('두잉이 지원서를 관리하지 않는다는 안내와 회원 등록 절차를 알린다', () => {
      mockDetailQuery.mockReturnValue(detailSuccess(externalDetail()));

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);

      expect(
        screen.getByText(
          '외부 모집은 두잉에서 지원서를 관리하지 않습니다. 회원 등록은 가입 코드 → 가입 요청 → 운영진 승인 절차로 진행됩니다.',
        ),
      ).toBeInTheDocument();
    });

    it('외부 폼 주소를 플랫폼명과 함께 새 탭 링크로 연다', () => {
      mockDetailQuery.mockReturnValue(detailSuccess(externalDetail()));

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);

      const formLink = screen.getByRole('link', { name: /Google Forms/ });
      expect(formLink).toHaveAttribute('href', 'https://forms.gle/abc123');
      expect(formLink).toHaveAttribute('target', '_blank');
    });

    it('가입 링크 현황 네 칸을 서버 값 그대로 보여준다', () => {
      mockDetailQuery.mockReturnValue(detailSuccess(externalDetail()));

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);

      expect(screen.getByText('가입 코드 상태')).toBeInTheDocument();
      expect(screen.getByText('활성')).toBeInTheDocument();
      expect(screen.getByText('가입 요청')).toBeInTheDocument();
      expect(screen.getByText('12건')).toBeInTheDocument();
      expect(screen.getByText('승인 대기')).toBeInTheDocument();
      expect(screen.getByText('3건')).toBeInTheDocument();
      expect(screen.getByText('회원 등록')).toBeInTheDocument();
      expect(screen.getByText('9명')).toBeInTheDocument();
    });

    it('활성 코드가 없으면 코드 없음으로 읽힌다', () => {
      mockDetailQuery.mockReturnValue(detailSuccess(externalDetail({ joinLink: null })));

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);

      expect(screen.getByText('코드 없음')).toBeInTheDocument();
    });

    it('지원자 목록은 아예 렌더하지 않는다 — 두잉에 지원 데이터가 없다', () => {
      mockDetailQuery.mockReturnValue(detailSuccess(externalDetail()));

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);

      expect(screen.queryByRole('table')).toBeNull();
      expect(screen.queryByText('0명')).toBeNull();
    });
  });

  describe('강제 마감', () => {
    it('마감에 성공하면 안내 토스트를 띄우고 다이얼로그를 닫는다', async () => {
      const user = userEvent.setup();
      mockForceClose.mockImplementation((_variables, options) => options.onSuccess());

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);
      await user.click(screen.getByRole('button', { name: '강제 마감' }));
      await user.click(screen.getByRole('button', { name: '마감하기' }));

      expect(mockForceClose).toHaveBeenCalledWith(
        { recruitmentId: 5, payload: { reason: undefined } },
        expect.anything(),
      );
      expect(mockAddToast).toHaveBeenCalledWith('모집을 마감했습니다.');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('입력한 사유를 다듬어 함께 보낸다', async () => {
      const user = userEvent.setup();
      mockForceClose.mockImplementation((_variables, options) => options.onSuccess());

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);
      await user.click(screen.getByRole('button', { name: '강제 마감' }));
      await user.type(screen.getByLabelText('마감 사유 (선택)'), '  기간 경과 방치  ');
      await user.click(screen.getByRole('button', { name: '마감하기' }));

      expect(mockForceClose).toHaveBeenCalledWith(
        { recruitmentId: 5, payload: { reason: '기간 경과 방치' } },
        expect.anything(),
      );
    });

    it('이미 마감된 모집이면 다이얼로그를 열어 둔 채 그 사실을 알린다', async () => {
      const user = userEvent.setup();
      mockForceClose.mockImplementation((_variables, options) =>
        options.onError(new MockApiError(409)),
      );

      render(<AdminRecruitmentDetailPage recruitmentId={5} />);
      await user.click(screen.getByRole('button', { name: '강제 마감' }));
      await user.click(screen.getByRole('button', { name: '마감하기' }));

      expect(screen.getByText('이미 마감된 모집입니다.')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(mockAddToast).not.toHaveBeenCalled();
    });
  });
});
