import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignupStepVerify } from '@/app/(auth)/signup/_components/SignupStepVerify';
import type { PhoneVerificationController } from '@/app/(auth)/signup/_lib/use-phone-verification';

function makeController(overrides: Partial<PhoneVerificationController>): PhoneVerificationController {
  return {
    status: 'idle',
    verified: false,
    session: null,
    verificationToken: null,
    code: '',
    moNumber: '16663538',
    qrCode: null,
    remainingSeconds: 0,
    resendCooldownSeconds: 0,
    issuing: false,
    canIssue: false,
    errorMessage: null,
    stalled: false,
    issue: vi.fn(),
    markSent: vi.fn(),
    reset: vi.fn(),
    recheck: vi.fn(),
    ...overrides,
  };
}

describe('SignupStepVerify', () => {
  it('미인증 상태면 다음 버튼을 렌더하지 않는다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'idle', verified: false })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /다음/ })).not.toBeInTheDocument();
  });

  it('인증되면 다음 버튼을 노출하고 클릭 시 onNext 를 호출한다', async () => {
    const onNext = vi.fn();
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'verified', verified: true })}
        onNext={onNext}
      />,
    );
    const nextButton = screen.getByRole('button', { name: /다음/ });
    await userEvent.click(nextButton);
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('idle 이면 풀 히어로(서브 문구 + 일러스트)를 보여준다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'idle' })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '문자로 코드를 보내주세요' })).toBeInTheDocument();
    expect(screen.getByText('문자 한 통이면 본인 인증 끝')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '문자로 코드를 보내 본인 인증하는 방법 안내' }),
    ).toBeInTheDocument();
  });

  it('expired 이면 idle 처럼 풀 히어로(서브 문구 + 일러스트)를 보여준다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'expired' })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '문자로 코드를 보내주세요' })).toBeInTheDocument();
    expect(screen.getByText('문자 한 통이면 본인 인증 끝')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /본인 인증하는 방법/ })).toBeInTheDocument();
  });

  it('issued 면 제목은 유지하되 일러스트·서브 문구는 숨긴다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'issued', code: '7K3M9PXQ' })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '문자로 코드를 보내주세요' })).toBeInTheDocument();
    expect(screen.queryByText('문자 한 통이면 본인 인증 끝')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /본인 인증하는 방법/ }),
    ).not.toBeInTheDocument();
  });

  it('verified 면 히어로 제목을 숨긴다', () => {
    render(
      <SignupStepVerify
        phone="010-1234-5678"
        onPhoneChange={vi.fn()}
        verification={makeController({ status: 'verified', verified: true })}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByRole('heading', { name: '문자로 코드를 보내주세요' })).not.toBeInTheDocument();
  });
});
