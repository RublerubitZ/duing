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
});
