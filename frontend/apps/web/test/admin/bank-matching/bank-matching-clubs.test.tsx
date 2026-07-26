import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ApiError, NETWORK_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE } from '@duing/api';
import type { BankMatchingClub, BankMatchingOverview } from '@duing/types';

const mockSetActive = vi.fn();
const mockRefetch = vi.fn();

// 훅 반환값을 케이스별로 통째로 지정한다(레포 관행) — 파생 계산을 두지 않아
// isError=true 인데 data 가 있는 불가능한 조합이 실수로 만들어지지 않는다.
// 구버전 백엔드 응답(registeredCount 없음)까지 표현해 `as` 단언 없이 전환기를 재현한다.
type LegacyOverview = Omit<BankMatchingOverview, 'registeredCount'>;
type OverviewQueryResult = {
  data?: BankMatchingOverview | LegacyOverview;
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
};
const mockOverviewQuery = vi.fn<() => OverviewQueryResult>();

vi.mock('@duing/hooks', () => ({
  useAdminBankMatchingQuery: () => ({ refetch: mockRefetch, ...mockOverviewQuery() }),
  useSetBankMatchingMutation: () => ({ mutate: mockSetActive, isPending: false, error: null }),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { BankMatchingClubs } from '@/app/admin/bank-matching/_components/BankMatchingClubs';

function makeClub(overrides: Partial<BankMatchingClub> = {}): BankMatchingClub {
  return {
    clubId: 1,
    clubName: '두잉 동아리',
    bank: 'NH',
    accountHolder: '홍길동',
    maskedAccountNumber: '****7890',
    eligible: true,
    ineligibleReason: null,
    registered: false,
    ...overrides,
  };
}

function givenOverview(overview: BankMatchingOverview) {
  mockOverviewQuery.mockReturnValue({ data: overview, isLoading: false, isError: false });
}

function givenQueryError(error: unknown) {
  mockOverviewQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true, error });
}

describe('BankMatchingClubs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    givenOverview({ clubs: [], registeredCount: 0 });
  });

  it('등록 동아리 수와 동아리 목록을 렌더링한다', () => {
    givenOverview({
      clubs: [makeClub({ clubId: 1, clubName: '코딩 동아리' })],
      registeredCount: 1,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('자동매칭 등록 1개 동아리')).toBeInTheDocument();
    expect(screen.getByText('코딩 동아리')).toBeInTheDocument();
  });

  // 조회가 성공하면 등록 현황은 언제나 채워진다 — 예전의 "일시적으로 불러올 수 없어요" 는
  // 존재하지 않는 외부 슬롯 API 를 부르다 실패해서 생긴 상태였고, 이제는 그런 상태 자체가 없다.
  it('등록 동아리가 없어도 0 으로 현황을 표시한다', () => {
    givenOverview({
      clubs: [makeClub({ clubId: 1, clubName: '재즈 동아리' })],
      registeredCount: 0,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('자동매칭 등록 0개 동아리')).toBeInTheDocument();
    expect(screen.queryByText(/일시적으로 불러올 수 없어요/)).not.toBeInTheDocument();
    expect(screen.getByText('재즈 동아리')).toBeInTheDocument();
  });

  it.each([
    [
      '401 로그인 만료',
      new ApiError(401, '인증이 필요합니다.'),
      '세션이 만료되었어요. 다시 로그인해 주세요.',
    ],
    [
      '403 권한 없음',
      new ApiError(403, '권한이 없습니다.'),
      '총동연 계정으로만 볼 수 있는 화면이에요.',
    ],
    [
      '500 서버 오류',
      new ApiError(500, '서버 오류'),
      '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    ],
    [
      '502 게이트웨이',
      new ApiError(502, '요청 실패 (502)'),
      '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
    ],
    [
      '네트워크 단절',
      new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK'),
      NETWORK_ERROR_MESSAGE,
    ],
    [
      '요청 시간 초과',
      new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT'),
      TIMEOUT_ERROR_MESSAGE,
    ],
    // 4xx 는 백엔드 문구를 그대로 보여준다.
    ['409 충돌', new ApiError(409, '이미 처리된 요청입니다.'), '이미 처리된 요청입니다.'],
    // 문구가 비어 오면 빈 카드가 남지 않도록 폴백으로 채운다.
    [
      '빈 메시지',
      new ApiError(400, '   '),
      '목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    ],
    // ApiError 가 아닌 에러(toApiError 가 미분류 에러를 그대로 재던지는 경로).
    ['ApiError 아님', new Error('boom'), '목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'],
  ])('조회 실패 원인별로 다른 안내를 노출한다: %s', (_label, error, expected) => {
    givenQueryError(error);
    render(<BankMatchingClubs />);

    expect(screen.getByRole('alert')).toHaveTextContent(expected);
  });

  it('조회 실패 카드의 [다시 시도]는 재조회를 호출한다', async () => {
    const user = userEvent.setup();
    givenQueryError(new ApiError(500, '서버 오류'));
    render(<BankMatchingClubs />);

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(mockRefetch).toHaveBeenCalled();
  });

  it('재조회가 실패해도 이미 받은 목록이 있으면 목록을 유지한다', () => {
    mockOverviewQuery.mockReturnValue({
      data: { clubs: [makeClub({ clubId: 1, clubName: '코딩 동아리' })], registeredCount: 1 },
      isLoading: false,
      isError: true,
      error: new ApiError(500, '서버 오류'),
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('코딩 동아리')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('등록 수 필드가 없으면(구버전 응답) 현황을 표시하지 않는다', () => {
    // 배포 전환기 가드 — `?? 0` 이면 실제 등록이 있어도 "0개" 라고 거짓 표시된다.
    mockOverviewQuery.mockReturnValue({
      data: { clubs: [makeClub({ clubId: 1 })] },
      isLoading: false,
      isError: false,
    });
    render(<BankMatchingClubs />);

    expect(screen.queryByText(/자동매칭 등록 .*개 동아리/)).not.toBeInTheDocument();
  });

  it('적격·미등록 동아리의 [등록]은 {clubId, active:true} 로 호출한다', async () => {
    const user = userEvent.setup();
    givenOverview({
      clubs: [makeClub({ clubId: 7, eligible: true, registered: false })],
      registeredCount: 1,
    });
    render(<BankMatchingClubs />);

    await user.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalled());
    const [payload] = mockSetActive.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ clubId: 7, active: true });
  });

  it('등록된 동아리의 [해제]는 {clubId, active:false} 로 호출한다', async () => {
    const user = userEvent.setup();
    givenOverview({
      clubs: [makeClub({ clubId: 9, registered: true })],
      registeredCount: 1,
    });
    render(<BankMatchingClubs />);

    await user.click(screen.getByRole('button', { name: '해제' }));

    await waitFor(() => expect(mockSetActive).toHaveBeenCalled());
    const [payload] = mockSetActive.mock.calls[0] as [Record<string, unknown>];
    expect(payload).toEqual({ clubId: 9, active: false });
  });

  it('부적격 동아리의 [등록]은 비활성이고 사유를 노출한다', () => {
    givenOverview({
      clubs: [
        makeClub({
          clubId: 3,
          eligible: false,
          ineligibleReason: '회비 계좌 미등록',
          registered: false,
        }),
      ],
      registeredCount: 1,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByRole('button', { name: '등록' })).toBeDisabled();
    expect(screen.getByText(/회비 계좌 미등록/)).toBeInTheDocument();
  });

  it('등록 동아리가 많아도 적격 동아리의 [등록]은 활성이다(외부 슬롯 한도 없음)', () => {
    givenOverview({
      clubs: [makeClub({ clubId: 4, eligible: true, registered: false })],
      registeredCount: 5,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByRole('button', { name: '등록' })).toBeEnabled();
  });

  it('등록 중 ApiError 가 발생하면 토스트로 메시지를 노출한다', async () => {
    const user = userEvent.setup();
    givenOverview({
      clubs: [makeClub({ clubId: 5, eligible: true, registered: false })],
      registeredCount: 1,
    });
    mockSetActive.mockImplementation(
      (_payload: unknown, options?: { onError?: (error: unknown) => void }) => {
        options?.onError?.(new ApiError(400, '등록 가능한 계좌 한도를 초과했습니다.'));
      },
    );
    render(<BankMatchingClubs />);

    await user.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() =>
      expect(mockAddToast).toHaveBeenCalledWith('등록 가능한 계좌 한도를 초과했습니다.', {
        variant: 'error',
      }),
    );
  });

  it('검색 입력으로 동아리 이름을 필터링한다', async () => {
    const user = userEvent.setup();
    givenOverview({
      clubs: [
        makeClub({ clubId: 1, clubName: '코딩 동아리' }),
        makeClub({ clubId: 2, clubName: '재즈 동아리' }),
      ],
      registeredCount: 1,
    });
    render(<BankMatchingClubs />);

    await user.type(screen.getByLabelText('동아리 이름 검색'), '재즈');

    expect(screen.getByText('재즈 동아리')).toBeInTheDocument();
    expect(screen.queryByText('코딩 동아리')).not.toBeInTheDocument();
  });

  it('등록 계좌의 은행 라벨·예금주·마스킹 번호와 자동매칭 활성 뱃지를 렌더링한다', () => {
    givenOverview({
      clubs: [
        makeClub({
          clubId: 1,
          clubName: '코딩 동아리',
          bank: 'KB',
          accountHolder: '김두잉',
          maskedAccountNumber: '****1234',
          registered: true,
        }),
      ],
      registeredCount: 1,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('KB국민 · 김두잉 · ****1234')).toBeInTheDocument();
    expect(screen.getByText('자동매칭 활성')).toBeInTheDocument();
  });

  it('maskedAccountNumber 가 null 이면 "계좌 확인 불가" 로 표시하고 비활성 뱃지를 노출한다', () => {
    givenOverview({
      clubs: [
        makeClub({
          clubId: 2,
          clubName: '재즈 동아리',
          bank: 'NH',
          accountHolder: '총무',
          maskedAccountNumber: null,
          registered: false,
        }),
      ],
      registeredCount: 1,
    });
    render(<BankMatchingClubs />);

    expect(screen.getByText('NH농협 · 총무 · 계좌 확인 불가')).toBeInTheDocument();
    expect(screen.getByText('자동매칭 비활성')).toBeInTheDocument();
  });
});
