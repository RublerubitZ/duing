import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, NETWORK_ERROR_MESSAGE } from '@duing/api';
import { ProfileCheckSemesterChangedError, type UpdateAdminProfileCheckVariables } from '@duing/hooks';
import type { AdminProfileCheck } from '@duing/types';

// 훅 반환값을 케이스별로 통째로 지정한다(레포 관행 — bank-matching-clubs.test.tsx).
type ProfileCheckQueryResult = {
  data?: AdminProfileCheck;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
};
type MutateOptions = { onSuccess?: () => void; onError?: (error: unknown) => void };

const mockProfileCheckQuery = vi.fn<() => ProfileCheckQueryResult>();
const mockRefetch = vi.fn();
const mockMutate = vi.fn<(variables: UpdateAdminProfileCheckVariables, options?: MutateOptions) => void>();
const mockMutationState = { isPending: false };

// 학기 변경 오류는 화면이 instanceof 로 가르므로 진짜 클래스를 그대로 내보낸다.
vi.mock('@duing/hooks', async (importOriginal) => {
  const actualHooks = await importOriginal<typeof import('@duing/hooks')>();
  return {
    ProfileCheckSemesterChangedError: actualHooks.ProfileCheckSemesterChangedError,
    useAdminProfileCheckQuery: () => ({ refetch: mockRefetch, ...mockProfileCheckQuery() }),
    useUpdateAdminProfileCheckMutation: () => ({
      mutate: mockMutate,
      isPending: mockMutationState.isPending,
    }),
  } satisfies Partial<Record<keyof typeof import('@duing/hooks'), unknown>>;
});

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { AdminProfileCheckPage } from '@/app/admin/profile-check/_pages/AdminProfileCheckPage';

function makeProfileCheck(overrides: Partial<AdminProfileCheck> = {}): AdminProfileCheck {
  return {
    enabled: true,
    semesterYear: 2027,
    semesterTerm: 1,
    currentSemesterYear: 2027,
    currentSemesterTerm: 1,
    title: '제목',
    message: '문구',
    targetCount: 1240,
    confirmedCount: 812,
    unconfirmedCount: 428,
    ...overrides,
  };
}

function givenProfileCheck(profileCheck: AdminProfileCheck) {
  mockProfileCheckQuery.mockReturnValue({ data: profileCheck, isLoading: false, isError: false });
}

function saveButton() {
  return screen.getByRole('button', { name: '변경사항 저장' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutate.mockReset();
  mockMutationState.isPending = false;
  givenProfileCheck(makeProfileCheck());
});

describe('AdminProfileCheckPage — 조회 상태', () => {
  it('불러오는 동안 로딩 표시를 보여 준다', () => {
    mockProfileCheckQuery.mockReturnValue({ isLoading: true, isError: false });
    render(<AdminProfileCheckPage />);

    expect(screen.getByRole('status', { name: '정보 확인 팝업 설정 불러오는 중' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '변경사항 저장' })).not.toBeInTheDocument();
  });

  it.each([
    ['서버 오류는 폴백 문구', new ApiError(500, '서버 오류'), '설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'],
    [
      '네트워크 단절은 정규화 문구 그대로',
      new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK'),
      NETWORK_ERROR_MESSAGE,
    ],
  ])('불러오지 못하면 안내와 다시 시도를 보여 준다 — %s', async (_caseName, error, expected) => {
    mockProfileCheckQuery.mockReturnValue({ isLoading: false, isError: true, error });
    const user = userEvent.setup();
    render(<AdminProfileCheckPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(expected);
    await user.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

describe('AdminProfileCheckPage — 현황', () => {
  it('노출 중이면 상태·학기·인원과 확인 비율을 보여 준다', () => {
    render(<AdminProfileCheckPage />);

    expect(screen.getByText('노출 중')).toBeInTheDocument();
    expect(screen.getByText('2027학년도 1학기')).toBeInTheDocument();
    const tiles = within(screen.getByRole('list', { name: '확인 현황' })).getAllByRole('listitem');
    expect(tiles).toHaveLength(3);
    expect(tiles[0]).toHaveTextContent('대상');
    expect(tiles[0]).toHaveTextContent('1,240명');
    expect(tiles[1]).toHaveTextContent('확인 완료');
    expect(tiles[1]).toHaveTextContent('812명');
    // 812 / 1240 = 65.48… → 내림 65%
    expect(tiles[1]).toHaveTextContent('65%');
    expect(tiles[2]).toHaveTextContent('미확인');
    expect(tiles[2]).toHaveTextContent('428명');
    expect(screen.getByText('학기 중 가입·프로필 저장도 확인 완료로 셉니다.')).toBeInTheDocument();
    expect(screen.queryByText(/기간이 끝났어요/)).not.toBeInTheDocument();
  });

  it('대상이 0명이면 확인 비율을 보여 주지 않는다', () => {
    givenProfileCheck(makeProfileCheck({ targetCount: 0, confirmedCount: 0, unconfirmedCount: 0 }));
    render(<AdminProfileCheckPage />);

    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('확인 비율은 내림해 모두 확인하기 전에는 100% 로 보이지 않는다', () => {
    givenProfileCheck(makeProfileCheck({ targetCount: 1000, confirmedCount: 999, unconfirmedCount: 1 }));
    render(<AdminProfileCheckPage />);

    expect(screen.getByText('99%')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });

  it('확인 비율은 부동소수 오차 없이 계산한다 — 29/100 은 28% 가 아니라 29% 다', () => {
    givenProfileCheck(makeProfileCheck({ targetCount: 100, confirmedCount: 29, unconfirmedCount: 71 }));
    render(<AdminProfileCheckPage />);

    expect(screen.getByText('29%')).toBeInTheDocument();
    expect(screen.queryByText('28%')).not.toBeInTheDocument();
  });

  it('지난 학기에 켜 둔 팝업이 멈췄으면 꺼짐과 기간 종료 안내를 보이고, 스위치 안내는 오늘 학기를 말한다', () => {
    givenProfileCheck(
      makeProfileCheck({ enabled: false, currentSemesterYear: 2027, currentSemesterTerm: 2 }),
    );
    render(<AdminProfileCheckPage />);

    expect(screen.getByText('꺼짐')).toBeInTheDocument();
    expect(screen.queryByText('노출 중')).not.toBeInTheDocument();
    expect(
      screen.getByText('2027학년도 1학기 팝업은 기간이 끝났어요. 다시 켜면 2027학년도 2학기로 시작돼요.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('켜면 오늘 기준 학기(2027학년도 2학기)에 적용되고, 학기가 바뀌면 자동으로 꺼져요.'),
    ).toBeInTheDocument();
  });

  it('같은 학기에서 꺼 두었으면 기간 종료 안내가 없다', () => {
    givenProfileCheck(makeProfileCheck({ enabled: false }));
    render(<AdminProfileCheckPage />);

    expect(screen.getByText('꺼짐')).toBeInTheDocument();
    expect(screen.queryByText(/기간이 끝났어요/)).not.toBeInTheDocument();
  });
});

describe('AdminProfileCheckPage — 설정 저장', () => {
  it('바꾼 게 없으면 저장 버튼이 꺼져 있고, 글자 수 카운터가 입력의 설명으로 연결된다', () => {
    render(<AdminProfileCheckPage />);

    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '팝업 제목' })).toHaveAccessibleDescription('2/50');
    expect(screen.getByRole('textbox', { name: '안내 문구' })).toHaveAccessibleDescription('2/300');
  });

  it('제목을 고치면 저장할 수 있고, 원래 값이나 공백만 남기면 다시 꺼진다', async () => {
    const user = userEvent.setup();
    render(<AdminProfileCheckPage />);
    const titleInput = screen.getByRole('textbox', { name: '팝업 제목' });

    await user.clear(titleInput);
    await user.type(titleInput, '새 제목');
    expect(saveButton()).toBeEnabled();

    // 서버 값과 같아지면 바뀐 게 없다.
    await user.clear(titleInput);
    await user.type(titleInput, '제목');
    expect(saveButton()).toBeDisabled();

    await user.clear(titleInput);
    await user.type(titleInput, '   ');
    expect(saveButton()).toBeDisabled();
  });

  it('스위치 행의 글자를 눌러도 노출 여부가 바뀐다', async () => {
    givenProfileCheck(makeProfileCheck({ enabled: false }));
    const user = userEvent.setup();
    render(<AdminProfileCheckPage />);
    const toggle = screen.getByRole('switch', { name: '사용자에게 보여주기' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByText('사용자에게 보여주기'));

    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(saveButton()).toBeEnabled();
  });

  it('저장하면 앞뒤 공백을 뺀 값을 보내고, 성공하면 토스트를 띄운 뒤 서버 값으로 돌아간다', async () => {
    mockMutate.mockImplementation((_payload, options) => options?.onSuccess?.());
    const user = userEvent.setup();
    render(<AdminProfileCheckPage />);
    const titleInput = screen.getByRole('textbox', { name: '팝업 제목' });

    await user.clear(titleInput);
    await user.type(titleInput, '  새 제목  ');
    await user.click(screen.getByRole('switch', { name: '사용자에게 보여주기' }));
    await user.click(saveButton());

    expect(mockMutate).toHaveBeenCalledTimes(1);
    // 화면이 그려질 때의 오늘 학기를 늘 함께 넘긴다 — 훅은 켜는 저장일 때만 저장 직전 서버의 오늘 학기와 견준다(이 저장은 끄기).
    expect(mockMutate.mock.calls[0]?.[0]).toEqual({
      payload: { title: '새 제목', message: '문구', enabled: false },
      expectedSemester: { currentSemesterYear: 2027, currentSemesterTerm: 1 },
    });
    expect(mockAddToast).toHaveBeenCalledWith('저장했어요.');
    // 초안을 비워 서버 값(훅 mock 의 그대로인 값)으로 돌아간다 — 실제로는 재조회가 끝난 뒤의 새 값이다.
    expect(titleInput).toHaveValue('제목');
    expect(screen.getByRole('switch', { name: '사용자에게 보여주기' })).toHaveAttribute('aria-checked', 'true');
    expect(saveButton()).toBeDisabled();
  });

  it.each([
    [
      '400 은 서버 문구',
      new ApiError(400, 'title: 팝업 제목은 50자 이하여야 합니다.'),
      'title: 팝업 제목은 50자 이하여야 합니다.',
    ],
    ['5xx 는 폴백', new ApiError(500, '서버 오류'), '저장하지 못했어요. 잠시 후 다시 시도해 주세요.'],
    [
      '네트워크 단절은 정규화 문구',
      new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK'),
      NETWORK_ERROR_MESSAGE,
    ],
    [
      '화면을 그린 뒤 학기가 바뀌었으면 다시 불러왔다는 안내',
      new ProfileCheckSemesterChangedError(),
      '학기가 바뀌어 최신 설정을 다시 불러왔어요. 확인한 뒤 다시 저장해 주세요.',
    ],
  ])('저장에 실패하면 입력을 남긴 채 저장 버튼 위에 알린다 — %s', async (_caseName, error, expected) => {
    mockMutate.mockImplementation((_payload, options) => options?.onError?.(error));
    const user = userEvent.setup();
    render(<AdminProfileCheckPage />);
    const titleInput = screen.getByRole('textbox', { name: '팝업 제목' });

    await user.clear(titleInput);
    await user.type(titleInput, '새 제목');
    await user.click(saveButton());

    expect(screen.getByRole('alert')).toHaveTextContent(expected);
    expect(titleInput).toHaveValue('새 제목');
    expect(mockAddToast).not.toHaveBeenCalled();
  });

  it('저장 중에는 입력·스위치·저장 버튼이 모두 잠기고 저장 중임을 알린다', () => {
    mockMutationState.isPending = true;
    render(<AdminProfileCheckPage />);

    expect(screen.getByRole('textbox', { name: '팝업 제목' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '안내 문구' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: '사용자에게 보여주기' })).toBeDisabled();
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('설정 저장 중')).toBeInTheDocument();
  });

  it('다른 운영진이 바꾼 값이 다시 들어와도 손대지 않은 칸은 새 값을 따른다', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<AdminProfileCheckPage />);
    const titleInput = screen.getByRole('textbox', { name: '팝업 제목' });
    await user.clear(titleInput);
    await user.type(titleInput, '새 제목');

    givenProfileCheck(makeProfileCheck({ message: '다른 운영진 문구' }));
    rerender(<AdminProfileCheckPage />);

    expect(screen.getByRole('textbox', { name: '안내 문구' })).toHaveValue('다른 운영진 문구');
    expect(titleInput).toHaveValue('새 제목');
    expect(saveButton()).toBeEnabled();
  });
});
