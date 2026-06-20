import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { ApiError } from '@duing/api';

const mockUseClubFeeAccountQuery = vi.fn();
const mockUpsertMutate = vi.fn();
const mockDeleteMutate = vi.fn();
const mockUseClubBankMatchingStatusQuery = vi.fn();
vi.mock('@duing/hooks', () => ({
  useClubFeeAccountQuery: (clubId: number) => mockUseClubFeeAccountQuery(clubId),
  useUpsertFeeAccountMutation: () => ({ mutate: mockUpsertMutate, isPending: false, error: null }),
  useDeleteFeeAccountMutation: () => ({ mutate: mockDeleteMutate, isPending: false, error: null }),
  useClubBankMatchingStatusQuery: (clubId: number) => mockUseClubBankMatchingStatusQuery(clubId),
}));

const mockAddToast = vi.fn();
vi.mock('@/app/_components/toast/ToastProvider', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

import { FeeAccountSection } from '@/app/manage/clubs/[clubId]/fees/_components/FeeAccountSection';

const registeredAccount = {
  bank: 'SHINHAN' as const,
  accountNumber: '110-123-456789',
  accountHolder: '홍길동',
};

describe('FeeAccountSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseClubBankMatchingStatusQuery.mockReturnValue({ data: { enabled: false } });
  });

  it('등록된 계좌가 있으면 은행 라벨·계좌번호·예금주를 표시하고 수정 버튼을 노출한다', () => {
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: registeredAccount,
      isLoading: false,
      error: null,
    });
    render(<FeeAccountSection clubId={1} />);

    expect(screen.getByText(/신한 · 110-123-456789/)).toBeInTheDocument();
    expect(screen.getByText('예금주 홍길동')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
  });

  it('미등록(404)이면 빈 상태 안내와 등록 폼을 노출한다', () => {
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(404, '회비 계좌를 찾을 수 없습니다.'),
    });
    render(<FeeAccountSection clubId={1} />);

    expect(screen.getByText('아직 등록된 회비 계좌가 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '등록하기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument();
  });

  it('은행 select 는 19개 옵션을 한글 라벨로 노출한다', () => {
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(404, '회비 계좌를 찾을 수 없습니다.'),
    });
    render(<FeeAccountSection clubId={1} />);

    const bankSelect = screen.getByRole('combobox', { name: '은행' });
    expect(within(bankSelect).getAllByRole('option')).toHaveLength(19);
    expect(screen.getByRole('option', { name: 'iM뱅크(대구)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'KB국민' })).toBeInTheDocument();
  });

  it('계좌번호가 비면 검증 에러를 표시하고 upsert 하지 않는다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(404, '회비 계좌를 찾을 수 없습니다.'),
    });
    render(<FeeAccountSection clubId={1} />);

    await user.type(screen.getByLabelText(/예금주/), '홍길동');
    await user.click(screen.getByRole('button', { name: '등록하기' }));

    expect(await screen.findByText('계좌번호는 필수입니다.')).toBeInTheDocument();
    expect(mockUpsertMutate).not.toHaveBeenCalled();
  });

  it('숫자·하이픈 외 계좌번호는 검증 에러를 표시한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(404, '회비 계좌를 찾을 수 없습니다.'),
    });
    render(<FeeAccountSection clubId={1} />);

    await user.type(screen.getByLabelText(/계좌번호/), '110-abc');
    await user.type(screen.getByLabelText(/예금주/), '홍길동');
    await user.click(screen.getByRole('button', { name: '등록하기' }));

    expect(
      await screen.findByText('계좌번호는 숫자와 하이픈(-)만 입력할 수 있습니다.'),
    ).toBeInTheDocument();
    expect(mockUpsertMutate).not.toHaveBeenCalled();
  });

  it('유효한 입력을 제출하면 트림된 페이로드로 upsert 를 호출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new ApiError(404, '회비 계좌를 찾을 수 없습니다.'),
    });
    render(<FeeAccountSection clubId={1} />);

    const bankSelect = screen.getByRole('combobox', { name: '은행' });
    await user.selectOptions(bankSelect, 'KAKAO');
    await user.type(screen.getByLabelText(/계좌번호/), '3333-01-1234567');
    await user.type(screen.getByLabelText(/예금주/), '  김두잉  ');
    await user.click(screen.getByRole('button', { name: '등록하기' }));

    await waitFor(() => expect(mockUpsertMutate).toHaveBeenCalled());
    const [payload] = mockUpsertMutate.mock.calls[0] as [
      { bank: string; accountNumber: string; accountHolder: string },
    ];
    expect(payload).toEqual({
      bank: 'KAKAO',
      accountNumber: '3333-01-1234567',
      accountHolder: '김두잉',
    });
  });

  it('등록된 계좌는 폼이 저장값으로 프리필되고, 한 필드를 수정해 제출하면 수정된 페이로드로 upsert 한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: registeredAccount,
      isLoading: false,
      error: null,
    });
    render(<FeeAccountSection clubId={1} />);

    // 폼이 저장된 계좌 값으로 프리필되었는지 확인한다.
    const bankSelect = screen.getByRole('combobox', { name: '은행' });
    expect(bankSelect).toHaveValue('SHINHAN');
    expect(screen.getByLabelText(/계좌번호/)).toHaveValue('110-123-456789');
    expect(screen.getByLabelText(/예금주/)).toHaveValue('홍길동');

    // 예금주 한 필드만 수정한 뒤 제출한다.
    const holderInput = screen.getByLabelText(/예금주/);
    await user.clear(holderInput);
    await user.type(holderInput, '김두잉');
    await user.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(mockUpsertMutate).toHaveBeenCalled());
    const [payload] = mockUpsertMutate.mock.calls[0] as [
      { bank: string; accountNumber: string; accountHolder: string },
    ];
    expect(payload).toEqual({
      bank: 'SHINHAN',
      accountNumber: '110-123-456789',
      accountHolder: '김두잉',
    });
  });

  it('등록된 계좌의 삭제 버튼을 누르면 확인 다이얼로그가 열리고 확인 시 삭제를 호출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({
      data: registeredAccount,
      isLoading: false,
      error: null,
    });
    render(<FeeAccountSection clubId={1} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '회비 계좌 삭제 확인' });
    await user.click(within(dialog).getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(mockDeleteMutate).toHaveBeenCalled());
  });

  it('자동매칭이 활성(enabled=true)이면 삭제 모달에 자동매칭 해제 경고를 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({ data: registeredAccount, isLoading: false, error: null });
    mockUseClubBankMatchingStatusQuery.mockReturnValue({ data: { enabled: true } });
    render(<FeeAccountSection clubId={1} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '회비 계좌 삭제 확인' });

    expect(within(dialog).getByText(/자동매칭이 활성화된 계좌입니다/)).toBeInTheDocument();
    expect(within(dialog).getByText(/자동매칭 계좌 및 동아리 연동이 끊기고/)).toBeInTheDocument();
    expect(within(dialog).getByText(/재등록을 원하실 경우 운영진 문의가 필요합니다/)).toBeInTheDocument();
  });

  it('자동매칭이 비활성(enabled=false)이면 삭제 모달에 기본 안내만 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({ data: registeredAccount, isLoading: false, error: null });
    mockUseClubBankMatchingStatusQuery.mockReturnValue({ data: { enabled: false } });
    render(<FeeAccountSection clubId={1} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '회비 계좌 삭제 확인' });

    expect(within(dialog).queryByText(/자동매칭이 활성화된 계좌입니다/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/동아리원이 더 이상 입금 계좌를 확인할 수 없습니다/)).toBeInTheDocument();
  });

  it('매칭 상태 조회 중(data=undefined)이면 삭제 모달에 기본 안내만 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({ data: registeredAccount, isLoading: false, error: null });
    mockUseClubBankMatchingStatusQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<FeeAccountSection clubId={1} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '회비 계좌 삭제 확인' });

    expect(within(dialog).queryByText(/자동매칭이 활성화된 계좌입니다/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/동아리원이 더 이상 입금 계좌를 확인할 수 없습니다/)).toBeInTheDocument();
  });

  it('매칭 상태 조회가 403 으로 실패해도 삭제 모달에 기본 안내만 노출한다', async () => {
    const user = userEvent.setup();
    mockUseClubFeeAccountQuery.mockReturnValue({ data: registeredAccount, isLoading: false, error: null });
    mockUseClubBankMatchingStatusQuery.mockReturnValue({
      data: undefined,
      error: new ApiError(403, '권한이 없습니다.'),
    });
    render(<FeeAccountSection clubId={1} />);

    await user.click(screen.getByRole('button', { name: '삭제' }));
    const dialog = await screen.findByRole('alertdialog', { name: '회비 계좌 삭제 확인' });

    expect(within(dialog).queryByText(/자동매칭이 활성화된 계좌입니다/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/동아리원이 더 이상 입금 계좌를 확인할 수 없습니다/)).toBeInTheDocument();
  });
});
