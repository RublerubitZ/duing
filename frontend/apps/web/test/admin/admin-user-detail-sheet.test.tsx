import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminUserDetail } from '@duing/types';

import {
  AdminUserDetailSheet,
  AdminUserDetailSheetContent,
} from '@/app/admin/users/_components/AdminUserDetailSheet';

/* ── 모듈 모킹 ─────────────────────────────────────────────── */
// 컨테이너 테스트용. TanStack Query 내부가 아니라 훅 모듈만 대체한다(레포 전례: admin-users.test.tsx).
const detailQueryResult = vi.fn();
const phoneMutate = vi.fn();
const phoneReset = vi.fn();
const noteMutate = vi.fn();

vi.mock('@duing/hooks', () => ({
  useAdminUserDetailQuery: (userId: number | undefined) => detailQueryResult(userId),
  useAdminUserPhoneMutation: () => ({ mutate: phoneMutate, reset: phoneReset, isPending: false }),
  useAdminUserNoteMutation: () => ({ mutate: noteMutate, isPending: false }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/* ── 테스트 데이터 ───────────────────────────────────────────── */
const detail: AdminUserDetail = {
  id: 12,
  name: '정우진',
  studentId: '2023118902',
  grade: 'SOPHOMORE',
  college: 'IT_ENGINEERING',
  major: '전자공학과',
  role: 'STUDENT',
  maskedPhone: '010-****-9983',
  phoneVerified: true,
  phoneVerifiedAt: '2024-03-04T01:00:00Z',
  status: 'SUSPENDED',
  createdAt: '2024-03-04T01:00:00Z',
  lastLoginAt: null,
  adminNote: '신고 누적으로 정지',
  adminNoteUpdatedAt: '2026-07-24T05:02:00Z',
  adminNoteUpdatedBy: '김운영',
  clubs: [{ clubId: 3, clubName: '두잉코드', role: 'LEADER', joinedAt: '2023-03-02T01:00:00Z' }],
  recentActions: [
    { action: 'ACCOUNT_SUSPENDED', actorName: '김운영', reason: '신고 3건', at: '2026-07-25T05:00:00Z' },
  ],
};

const noop = vi.fn();
const props = {
  detail,
  onClose: noop,
  onSuspend: noop,
  onUnsuspend: noop,
  onForceLogout: noop,
  onSaveNote: noop,
  onRevealPhone: noop,
  revealedPhone: null,
  isRevealingPhone: false,
  isSavingNote: false,
};

describe('회원 상세 Sheet', () => {
  it('마지막 로그인 기록이 없으면 "기록 없음"으로 표시한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('기록 없음')).toBeInTheDocument();
  });

  it('휴대폰은 마스킹된 값으로 표시하고 원본은 버튼을 눌러야 조회한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('010-****-9983')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '번호 확인' })).toBeInTheDocument();
  });

  it('원본 번호를 조회하면 마스킹 대신 원본을 보여준다', () => {
    render(<AdminUserDetailSheetContent {...props} revealedPhone="010-2210-9983" />);
    expect(screen.getByText('010-2210-9983')).toBeInTheDocument();
  });

  it('휴대폰 인증 여부를 표시한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('인증 완료')).toBeInTheDocument();
  });

  it('가입 동아리를 역할과 함께 보여준다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('두잉코드')).toBeInTheDocument();
    expect(screen.getByText('LEADER')).toBeInTheDocument();
  });

  it('메모 최종 수정 작업자를 표시한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText(/최종 수정/)).toHaveTextContent('김운영');
  });

  it('메모 입력은 서버와 같은 단위(UTF-16 코드유닛)로 1000자에서 막는다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByLabelText('관리자 메모')).toHaveAttribute('maxlength', '1000');
  });

  it('메모를 고쳐 저장하면 입력값 그대로 콜백에 넘긴다', async () => {
    const onSaveNote = vi.fn();
    const user = userEvent.setup();
    render(<AdminUserDetailSheetContent {...props} onSaveNote={onSaveNote} />);

    const noteInput = screen.getByLabelText('관리자 메모');
    await user.clear(noteInput);
    await user.type(noteInput, '본인 확인 통화 완료');
    await user.click(screen.getByRole('button', { name: '메모 저장' }));

    expect(onSaveNote).toHaveBeenCalledWith('본인 확인 통화 완료');
  });

  it('조치 이력을 사유와 함께 보여준다 — 사유가 어디에도 안 보이면 필수로 받는 의미가 없다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('계정 정지')).toBeInTheDocument();
    expect(screen.getByText(/신고 3건/)).toBeInTheDocument();
  });

  it('정지된 계정에는 해제 버튼을 보여준다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByRole('button', { name: '정지 해제' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '계정 정지' })).not.toBeInTheDocument();
  });

  it('정상 계정에는 정지 버튼을 보여주고 누르면 콜백을 부른다', async () => {
    const onSuspend = vi.fn();
    const user = userEvent.setup();
    render(
      <AdminUserDetailSheetContent
        {...props}
        detail={{ ...detail, status: 'ACTIVE' }}
        onSuspend={onSuspend}
      />,
    );

    expect(screen.queryByRole('button', { name: '정지 해제' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '계정 정지' }));
    expect(onSuspend).toHaveBeenCalled();
  });
});

describe('회원 상세 Sheet 컨테이너', () => {
  const callbacks = {
    onClose: vi.fn(),
    onSuspend: vi.fn(),
    onUnsuspend: vi.fn(),
    onForceLogout: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    detailQueryResult.mockReturnValue({ data: detail, isLoading: false, isError: false });
  });

  it('다른 회원으로 바뀌면 조회한 원본 번호를 화면과 뮤테이션 양쪽에서 지운다', async () => {
    phoneMutate.mockImplementation(
      (_userId: number, options?: { onSuccess?: (result: { phone: string }) => void }) =>
        options?.onSuccess?.({ phone: '010-2210-9983' }),
    );
    const user = userEvent.setup();
    const { rerender } = render(<AdminUserDetailSheet userId={12} {...callbacks} />);

    await user.click(screen.getByRole('button', { name: '번호 확인' }));
    expect(screen.getByText('010-2210-9983')).toBeInTheDocument();

    phoneReset.mockClear();
    detailQueryResult.mockReturnValue({
      data: { ...detail, id: 15, name: '한서연' },
      isLoading: false,
      isError: false,
    });
    rerender(<AdminUserDetailSheet userId={15} {...callbacks} />);

    expect(screen.queryByText('010-2210-9983')).not.toBeInTheDocument();
    // 로컬 state 만 비우면 뮤테이션에 남은 결과로 감사 로그 없이 번호를 다시 볼 경로가 열린다.
    expect(phoneReset).toHaveBeenCalledTimes(1);
  });

  it('메모를 저장하면 대상 회원 id 와 함께 뮤테이션을 호출한다', async () => {
    const user = userEvent.setup();
    render(<AdminUserDetailSheet userId={12} {...callbacks} />);

    await user.click(screen.getByRole('button', { name: '메모 저장' }));

    expect(noteMutate.mock.calls[0]?.[0]).toEqual({ userId: 12, note: '신고 누적으로 정지' });
  });

  it('상세 조회에 실패하면 안내 문구를 보여준다', () => {
    detailQueryResult.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<AdminUserDetailSheet userId={12} {...callbacks} />);

    expect(screen.getByText('회원 정보를 불러오지 못했습니다.')).toBeInTheDocument();
  });
});
