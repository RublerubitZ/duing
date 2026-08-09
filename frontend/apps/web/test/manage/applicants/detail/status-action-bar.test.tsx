import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { ApiError } from '@duing/api';
import { StatusActionBar } from '@/app/manage/clubs/[clubId]/recruitments/[recruitmentId]/applicants/[applicationId]/_components/StatusActionBar';
import { ToastProvider } from '@/app/_components/toast/ToastProvider';

const mockMutate = vi.fn();
/** 훅 mock 의 isPending — 스피너 표시처럼 "요청이 아직 안 끝난" 순간을 재현할 때만 켠다. */
let mockIsPending = false;

vi.mock('@duing/hooks', () => ({
  useUpdateApplicationStatusMutation: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderBar(ui: ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>);
}

/**
 * 데스크탑 카드와 모바일 하단 바가 같은 전이 버튼을 두 벌 렌더한다(화면에는 폭에 따라 하나만
 * 보이지만 jsdom 은 CSS 를 모른다). 클릭 핸들러는 공유하므로 동작 검증은 하단 바 한 벌이면 충분하다.
 */
function inBottomBar() {
  return within(screen.getByRole('region', { name: '상태 변경 액션' }));
}

/** mutate 를 즉시 실패시키는 스텁 — onError 콜백으로 넘긴 에러를 그대로 돌려준다. */
function failMutationWith(error: unknown) {
  mockMutate.mockImplementation((_variables, options) => {
    options?.onError?.(error);
    options?.onSettled?.();
  });
}

describe('StatusActionBar', () => {
  beforeEach(() => {
    mockMutate.mockReset();
    mockIsPending = false;
  });

  it('ON_HOLD + useInterview=true 면 면접대기와 불합격 버튼이 노출되고 합격 버튼은 없다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ON_HOLD" useInterview />);
    expect(inBottomBar().getByRole('button', { name: /면접 대상/ })).toBeInTheDocument();
    const buttonTexts = inBottomBar()
      .getAllByRole('button')
      .map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
    expect(buttonTexts.every((text) => !text.trim().startsWith('합격'))).toBe(true);
  });

  it('ON_HOLD + useInterview=false 면 합격과 불합격 버튼이 노출된다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ON_HOLD" useInterview={false} />);
    expect(inBottomBar().queryByRole('button', { name: /면접 대상/ })).not.toBeInTheDocument();
    const buttonTexts = inBottomBar()
      .getAllByRole('button')
      .map((btn) => btn.textContent ?? '');
    expect(buttonTexts.some((text) => text.includes('합격'))).toBe(true);
    expect(buttonTexts.some((text) => text.includes('불합격'))).toBe(true);
  });

  it('어떤 상태/조합에서도 "면접 일정 입력" 버튼이 렌더되지 않는다 (Legacy 회귀 가드)', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="INTERVIEW_PENDING" useInterview />);
    expect(screen.queryByRole('button', { name: '면접 일정 입력' })).not.toBeInTheDocument();
  });

  it('ACCEPTED 상태에서 최종 상태 메시지가 표시된다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ACCEPTED" useInterview />);
    expect(screen.getByText(/더 이상 변경 가능한 상태가 없습니다/)).toBeInTheDocument();
  });

  it('보류 버튼은 확인 모달 없이 즉시 mutate 한다', async () => {
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(inBottomBar().getByRole('button', { name: '보류로' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // 두 번째 인자는 실패 토스트 콜백 — 즉시 전이도 확인 모달 경로와 같은 실패 안내를 탄다.
    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 5, payload: { status: 'ON_HOLD' } },
      expect.anything(),
    );
  });

  it('면접 대상 버튼도 확인 모달 없이 즉시 mutate 한다', async () => {
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(inBottomBar().getByRole('button', { name: '면접 대상으로' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 5, payload: { status: 'INTERVIEW_PENDING' } },
      expect.anything(),
    );
  });

  it('합격 버튼은 확인 모달을 거쳐야 mutate 된다', async () => {
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="SUBMITTED" useInterview={false} />,
    );

    await userEvent.click(inBottomBar().getByRole('button', { name: '합격으로' }));

    expect(screen.getByRole('dialog', { name: '합격 처리하시겠습니까?' })).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '합격 처리' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 7, payload: { status: 'ACCEPTED' } },
      expect.anything(),
    );
  });

  it('불합격 버튼은 확인 모달을 거쳐야 mutate 된다', async () => {
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="INTERVIEW_PENDING" useInterview />,
    );

    await userEvent.click(inBottomBar().getByRole('button', { name: '불합격으로' }));

    expect(screen.getByRole('dialog', { name: '불합격 처리하시겠습니까?' })).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '불합격 처리' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { applicationId: 7, payload: { status: 'REJECTED' } },
      expect.anything(),
    );
  });

  it('확인 모달에서 취소하면 mutate 되지 않고 모달이 닫힌다', async () => {
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="INTERVIEW_PENDING" useInterview />,
    );

    await userEvent.click(inBottomBar().getByRole('button', { name: '합격으로' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  // 마감 모집 — 최종 결과 확정만 허용 (스펙 §1-3 개정)
  it('마감된 모집에서는 최종 결과 버튼만 남고 심사를 되돌리는 전이는 사라진다', () => {
    renderBar(
      <StatusActionBar
        applicationId={1}
        recruitmentId={1}
        currentStatus="SUBMITTED"
        useInterview
        finalizeOnly
      />,
    );

    // 면접 모집이어도 면접 단계를 거치지 않고 바로 확정할 수 있다 — 마감 후엔 라운드를 열 수 없다.
    expect(inBottomBar().getByRole('button', { name: '합격으로' })).toBeInTheDocument();
    expect(inBottomBar().getByRole('button', { name: '불합격으로' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보류로' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '면접 대상으로' })).not.toBeInTheDocument();
    // 안내 문구는 데스크탑 카드와 하단 바 양쪽에 있다 — 모바일에서도 보여야 하므로 바 기준으로 본다.
    expect(inBottomBar().getByText(/최종 결과만 확정할 수 있습니다/)).toBeInTheDocument();
  });

  it('마감된 모집에서 이미 결과가 확정된 지원은 남은 조치가 없다고 알린다', () => {
    renderBar(
      <StatusActionBar
        applicationId={1}
        recruitmentId={1}
        currentStatus="ACCEPTED"
        useInterview
        finalizeOnly
      />,
    );

    expect(screen.getByText('마감된 모집이고 결과도 확정되어 변경할 수 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '합격으로' })).not.toBeInTheDocument();
  });

  // 기존 조용한 실패 결함 해소 — 상태 변경 실패는 반드시 안내가 뜬다.
  it('상태 변경이 RECRUITMENT_CLOSED 로 실패하면 마감 안내 토스트를 띄운다', async () => {
    failMutationWith(new ApiError(409, '마감된 모집에서는 할 수 없는 작업입니다.', undefined, 'RECRUITMENT_CLOSED'));
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(inBottomBar().getByRole('button', { name: '보류로' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('마감된 모집에서는 할 수 없는 작업입니다');
  });

  it('그 외 실패에도 일반 실패 토스트를 띄운다', async () => {
    failMutationWith(new ApiError(500, '서버 오류'));
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(inBottomBar().getByRole('button', { name: '보류로' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('서버 오류');
  });

  it('확인 모달을 거치는 전이도 실패하면 토스트를 띄우고 모달을 닫는다', async () => {
    failMutationWith(new ApiError(409, '마감된 모집에서는 할 수 없는 작업입니다.', undefined, 'RECRUITMENT_CLOSED'));
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="SUBMITTED" useInterview={false} />,
    );

    await userEvent.click(inBottomBar().getByRole('button', { name: '합격으로' }));
    await userEvent.click(screen.getByRole('button', { name: '합격 처리' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('마감된 모집에서는 할 수 없는 작업입니다');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /* 데스크탑 카드와 모바일 하단 바가 같은 버튼을 두 벌 렌더한다.
   * jsdom 은 CSS 를 모르니 두 벌이 동시에 보이지 않는 조건(lg 분기)을 클래스로 못박는다. */
  it('모바일 하단 바는 데스크탑에서 숨고, 데스크탑 카드는 모바일에서 숨는다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="SUBMITTED" useInterview />);

    const bottomBar = screen.getByRole('region', { name: '상태 변경 액션' });
    expect(bottomBar).toHaveClass('lg:hidden');
    // ToastProvider 가 토스트 위치를 이 속성으로 실측한다 — 빠지면 토스트가 바를 덮는다.
    expect(bottomBar).toHaveAttribute('data-bottom-bar');

    const desktopSection = screen.getByRole('heading', { name: '상태 변경' }).closest('section');
    expect(desktopSection?.className).toContain('hidden');
    expect(desktopSection?.className).toContain('lg:block');
  });

  it('전이가 없으면 하단 바도 없고 안내 카드는 모바일에서도 보인다', () => {
    renderBar(<StatusActionBar applicationId={1} recruitmentId={1} currentStatus="ACCEPTED" useInterview />);

    expect(screen.queryByRole('region', { name: '상태 변경 액션' })).not.toBeInTheDocument();
    // 안내만 남은 카드까지 lg 로 감추면 모바일에서 아무 설명도 못 본다.
    expect(
      screen.getByRole('heading', { name: '상태 변경' }).closest('section')?.className,
    ).not.toContain('hidden');
  });

  it('하단 바 버튼은 44px 히트 영역과 위계(합격=primary, 불합격=danger-quiet)를 가진다', () => {
    renderBar(
      <StatusActionBar applicationId={1} recruitmentId={1} currentStatus="INTERVIEW_PENDING" useInterview />,
    );

    const accept = inBottomBar().getByRole('button', { name: '합격으로' });
    const reject = inBottomBar().getByRole('button', { name: '불합격으로' });
    // 히트 영역·시각 위계는 jsdom 이 계산하지 못한다 — 목록 전례처럼 클래스로 못박는다.
    expect(accept.className).toContain('btn-primary');
    expect(accept).toHaveClass('min-h-11');
    expect(reject.className).toContain('btn-danger-quiet');
    expect(reject).toHaveClass('min-h-11');
  });

  it('즉시 전이 중에는 누른 버튼에만 스피너가 뜬다', async () => {
    // 응답이 아직 오지 않은 창 — 콜백을 부르지 않고 isPending 만 켠다.
    mockMutate.mockImplementation(() => {
      mockIsPending = true;
    });
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(inBottomBar().getByRole('button', { name: '보류로' }));

    // 스피너 svg 는 aria-hidden(장식) 이라 role 로 못 찾는다 — 버튼 안 존재 여부로 본다.
    expect(
      inBottomBar().getByRole('button', { name: '보류로' }).querySelector('svg'),
    ).not.toBeNull();
    expect(
      inBottomBar().getByRole('button', { name: '면접 대상으로' }).querySelector('svg'),
    ).toBeNull();
  });

  // 성공도 안내한다 — 이전에는 실패만 토스트가 있어 성공 시 화면 변화를 스스로 찾아야 했다.
  it('즉시 전이가 성공하면 성공 토스트를 띄운다', async () => {
    mockMutate.mockImplementation((_variables, options) => {
      options?.onSuccess?.();
      options?.onSettled?.();
    });
    renderBar(<StatusActionBar applicationId={5} recruitmentId={2} currentStatus="SUBMITTED" useInterview />);

    await userEvent.click(inBottomBar().getByRole('button', { name: '보류로' }));

    expect(await screen.findByRole('status')).toHaveTextContent('상태를 변경했습니다');
  });

  it('확인 모달을 거치는 전이가 성공해도 성공 토스트를 띄운다', async () => {
    mockMutate.mockImplementation((_variables, options) => {
      options?.onSuccess?.();
      options?.onSettled?.();
    });
    renderBar(
      <StatusActionBar applicationId={7} recruitmentId={2} currentStatus="SUBMITTED" useInterview={false} />,
    );

    await userEvent.click(inBottomBar().getByRole('button', { name: '합격으로' }));
    await userEvent.click(screen.getByRole('button', { name: '합격 처리' }));

    expect(await screen.findByRole('status')).toHaveTextContent('상태를 변경했습니다');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
