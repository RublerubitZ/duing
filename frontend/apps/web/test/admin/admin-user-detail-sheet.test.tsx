import { fireEvent, render, screen } from '@testing-library/react';
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
// 기본 시나리오는 "다른 학생 회원을 보는 관리자" — 대상(id 12)과 다른 id 를 둬야 자기 자신 가드가 켜지지 않는다.
const CURRENT_ADMIN_ID = 99;
const props = {
  detail,
  currentUserId: CURRENT_ADMIN_ID,
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

  it('가입 동아리 역할은 원문 enum 이 아니라 한글 라벨로 보여준다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText('두잉코드')).toBeInTheDocument();
    expect(screen.getByText('회장')).toBeInTheDocument();
    expect(screen.queryByText('LEADER')).not.toBeInTheDocument();
  });

  it('메모 최종 수정 작업자를 표시한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByText(/최종 수정/)).toHaveTextContent('김운영');
  });

  it('메모 작업자가 탈퇴해 이름만 null 이면 조치 이력과 같은 문구로 대체한다', () => {
    render(
      <AdminUserDetailSheetContent {...props} detail={{ ...detail, adminNoteUpdatedBy: null }} />,
    );

    const lastUpdatedLine = screen.getByText(/최종 수정/);
    expect(lastUpdatedLine).toHaveTextContent('알 수 없음');
    expect(lastUpdatedLine).not.toHaveTextContent('null');
  });

  it('메모 입력은 서버와 같은 단위(UTF-16 코드유닛)로 1000자에서 막는다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByLabelText('관리자 메모')).toHaveAttribute('maxlength', '1000');
  });

  it('상한을 넘는 메모가 들어오면 저장 버튼을 막는다 — maxLength 는 타이핑·붙여넣기만 끊는다', async () => {
    const onSaveNote = vi.fn();
    const user = userEvent.setup();
    render(<AdminUserDetailSheetContent {...props} onSaveNote={onSaveNote} />);

    // 드래그-드롭 삽입이나 자동입력 확장은 maxLength 를 통과한다. 그대로 보내면 서버가 400 을 낸다.
    fireEvent.change(screen.getByLabelText('관리자 메모'), { target: { value: '기'.repeat(1001) } });

    const saveButton = screen.getByRole('button', { name: '메모 저장' });
    expect(saveButton).toBeDisabled();
    await user.click(saveButton);
    expect(onSaveNote).not.toHaveBeenCalled();
  });

  it('상한에 가까워지면 글자 수를 보여준다 — 왜 막혔는지 화면에서 읽을 수 있어야 한다', () => {
    render(<AdminUserDetailSheetContent {...props} />);

    // 여유가 넉넉한 구간에서는 카운터가 잡음이라 띄우지 않는다.
    expect(screen.queryByText(/\/1000$/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('관리자 메모'), { target: { value: '기'.repeat(1001) } });

    expect(screen.getByLabelText('관리자 메모')).toHaveAccessibleDescription('1001/1000');
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

  it('저장 중 계속 타이핑하면 재조회가 착지해도 입력이 유지된다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AdminUserDetailSheetContent {...props} isSavingNote />);

    const noteInput = screen.getByLabelText('관리자 메모');
    await user.clear(noteInput);
    await user.type(noteInput, '본인 확인 통화 완료');

    // 저장 성공 → 상세 무효화 → 저장 시점 값으로 재조회가 착지한 상황.
    // 서버 값을 다시 시드하면 그 사이 친 뒷부분이 경고 없이 사라진다.
    rerender(
      <AdminUserDetailSheetContent
        {...props}
        detail={{ ...detail, adminNote: '본인 확인 통화' }}
        isSavingNote={false}
      />,
    );

    expect(noteInput).toHaveValue('본인 확인 통화 완료');
  });

  it('다른 회원으로 패널이 바뀌면 그 회원 메모로 다시 시드한다', () => {
    const { rerender } = render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.getByLabelText('관리자 메모')).toHaveValue('신고 누적으로 정지');

    rerender(
      <AdminUserDetailSheetContent
        {...props}
        detail={{ ...detail, id: 15, name: '한서연', adminNote: '본인 확인 완료' }}
      />,
    );

    expect(screen.getByLabelText('관리자 메모')).toHaveValue('본인 확인 완료');
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

  // 서버가 400 으로 막는 두 경우를 화면에서 미리 거른다 — 사유를 다 입력하고 확인까지 누른 뒤에야
  // 거절당하는 헛수고를 없앤다. 서버 검증은 그대로 두고 화면은 한 겹 앞에서 거를 뿐이다.
  it('관리자 계정에는 정지 버튼을 잠그고 사유를 화면에 보여준다', () => {
    render(
      <AdminUserDetailSheetContent
        {...props}
        detail={{ ...detail, status: 'ACTIVE', role: 'ADMIN' }}
      />,
    );

    expect(screen.getByRole('button', { name: '계정 정지' })).toBeDisabled();
    // 잠긴 버튼은 포커스를 못 받아 툴팁이 닿지 않는다 — 사유가 화면 텍스트로 있어야 한다.
    expect(screen.getByText('관리자 계정은 정지할 수 없습니다.')).toBeInTheDocument();
  });

  it('자기 자신의 계정에는 정지 버튼을 잠그고 사유를 화면에 보여준다', () => {
    render(
      <AdminUserDetailSheetContent
        {...props}
        detail={{ ...detail, status: 'ACTIVE' }}
        currentUserId={detail.id}
      />,
    );

    expect(screen.getByRole('button', { name: '계정 정지' })).toBeDisabled();
    expect(screen.getByText('자기 자신의 계정은 정지할 수 없습니다.')).toBeInTheDocument();
  });

  // 운영 기록은 기본 3건만 보여준다 — 서버가 최근 20건을 함께 내려주므로 펼치는 데 추가 조회가 없다.
  it('운영 기록이 3건을 넘으면 3건만 보여주고 나머지는 펼쳐서 본다', async () => {
    const user = userEvent.setup();
    const manyActions = Array.from({ length: 5 }, (_, index) => ({
      action: 'ACCOUNT_SUSPENDED' as const,
      actorName: `운영자${index}`,
      reason: `사유 ${index}`,
      at: '2026-07-25T05:00:00Z',
    }));
    render(
      <AdminUserDetailSheetContent {...props} detail={{ ...detail, recentActions: manyActions }} />,
    );

    expect(screen.getByText('사유 0')).toBeInTheDocument();
    expect(screen.getByText('사유 2')).toBeInTheDocument();
    expect(screen.queryByText('사유 3')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /전체 기록 보기/ }));

    expect(screen.getByText('사유 4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /전체 기록 보기/ })).not.toBeInTheDocument();
  });

  it('운영 기록이 3건 이하이면 펼치기 버튼을 두지 않는다', () => {
    render(<AdminUserDetailSheetContent {...props} />);
    expect(screen.queryByRole('button', { name: /전체 기록 보기/ })).not.toBeInTheDocument();
  });

  // 강제 로그아웃에는 이 제약이 없다 — 계정이 잠기지 않고 재로그인하면 복구되므로 본인·다른 관리자 모두 허용이 의도다.
  it('관리자 계정이어도 강제 로그아웃은 막지 않는다', () => {
    render(
      <AdminUserDetailSheetContent
        {...props}
        detail={{ ...detail, status: 'ACTIVE', role: 'ADMIN' }}
        currentUserId={detail.id}
      />,
    );

    expect(screen.getByRole('button', { name: '로그아웃' })).toBeEnabled();
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
