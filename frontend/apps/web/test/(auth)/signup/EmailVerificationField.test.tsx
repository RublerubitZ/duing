import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailVerificationField } from '../../../app/(auth)/signup/_components/EmailVerificationField';

const baseProps = {
  email: 'hong@daegu.ac.kr',
  onEmailChange: () => {},
  status: 'idle' as const,
  code: '',
  onCodeChange: () => {},
  remainingSeconds: 0,
  resendCooldownSeconds: 0,
  sending: false,
  confirming: false,
  canSend: true,
  errorMessage: null,
  onSend: () => {},
  onConfirm: () => {},
  onEditEmail: () => {},
};

describe('EmailVerificationField', () => {
  it('idle 상태에서 발송 버튼 클릭 시 onSend 가 호출된다', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<EmailVerificationField {...baseProps} onSend={onSend} />);
    await user.click(screen.getByRole('button', { name: '인증코드 발송' }));
    expect(onSend).toHaveBeenCalled();
  });

  it('canSend=false 면 발송 버튼이 비활성화된다', () => {
    render(<EmailVerificationField {...baseProps} canSend={false} />);
    expect(screen.getByRole('button', { name: '인증코드 발송' })).toBeDisabled();
  });

  it('codeSent 상태에서 코드 입력 필드와 만료 카운트다운이 표시된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" remainingSeconds={1200} resendCooldownSeconds={60} />,
    );
    expect(screen.getByLabelText('인증코드')).toBeInTheDocument();
    expect(screen.getByText(/20:00/)).toBeInTheDocument();
  });

  it('재발송 쿨다운 중에는 재발송 버튼이 비활성화되고 남은 초가 표시된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" remainingSeconds={1190} resendCooldownSeconds={50} />,
    );
    const resendButton = screen.getByRole('button', { name: /재발송/ });
    expect(resendButton).toBeDisabled();
    expect(resendButton).toHaveTextContent('50');
  });

  it('6자리 코드 입력 후 확인 클릭 시 onConfirm 이 호출된다', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <EmailVerificationField
        {...baseProps}
        status="codeSent"
        code="123456"
        remainingSeconds={1000}
        onConfirm={onConfirm}
      />,
    );
    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('코드가 6자리 미만이면 확인 버튼이 비활성화된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" code="123" remainingSeconds={1000} />,
    );
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  });

  it('만료(remainingSeconds=0) 시 만료 안내가 표시되고 확인 버튼이 비활성화된다', () => {
    render(
      <EmailVerificationField {...baseProps} status="codeSent" code="123456" remainingSeconds={0} />,
    );
    expect(screen.getByText(/만료/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인' })).toBeDisabled();
  });

  it('verified 상태에서 인증 완료 배지가 보이고 이메일이 잠긴다', () => {
    render(<EmailVerificationField {...baseProps} status="verified" />);
    expect(screen.getByText('인증 완료')).toBeInTheDocument();
    expect(screen.getByLabelText('학교 이메일')).toHaveAttribute('readOnly');
  });

  it('verified 상태에서 변경 버튼 클릭 시 onEditEmail 이 호출된다', async () => {
    const onEditEmail = vi.fn();
    const user = userEvent.setup();
    render(<EmailVerificationField {...baseProps} status="verified" onEditEmail={onEditEmail} />);
    await user.click(screen.getByRole('button', { name: '변경' }));
    expect(onEditEmail).toHaveBeenCalled();
  });

  it('errorMessage 가 있으면 표시된다', () => {
    render(<EmailVerificationField {...baseProps} errorMessage="인증코드가 올바르지 않아요." />);
    expect(screen.getByText('인증코드가 올바르지 않아요.')).toBeInTheDocument();
  });
});
