import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhoneVerificationField } from '../../../app/(auth)/signup/_components/PhoneVerificationField';

const baseProps = {
  phone: '010-1234-5678',
  onPhoneChange: () => {},
  status: 'idle' as const,
  code: '',
  moNumber: '',
  qrCode: null,
  remainingSeconds: 0,
  resendCooldownSeconds: 0,
  issuing: false,
  canIssue: true,
  errorMessage: null,
  onIssue: () => {},
  onSent: () => {},
  onReset: () => {},
};

describe('PhoneVerificationField', () => {
  it('idle 에서 유효 번호면 인증 시작 버튼이 활성화된다', () => {
    render(<PhoneVerificationField {...baseProps} />);
    expect(screen.getByRole('button', { name: '인증 시작' })).not.toBeDisabled();
  });

  it('canIssue=false 면 인증 시작 버튼이 비활성화된다', () => {
    render(<PhoneVerificationField {...baseProps} canIssue={false} />);
    expect(screen.getByRole('button', { name: '인증 시작' })).toBeDisabled();
  });

  it('issued 에서 코드와 수신번호, 문자를 보냈어요 버튼을 노출한다', () => {
    render(
      <PhoneVerificationField
        {...baseProps}
        status="issued"
        code="7K3M9PXQ"
        moNumber="16663538"
        remainingSeconds={300}
      />,
    );
    expect(screen.getByText('7K3M9PXQ')).toBeInTheDocument();
    expect(screen.getByText(/1666-3538/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '문자를 보냈어요' })).toBeInTheDocument();
  });

  it('문자를 보냈어요를 누르면 onSent 를 호출한다', async () => {
    const onSent = vi.fn();
    const user = userEvent.setup();
    render(
      <PhoneVerificationField
        {...baseProps}
        status="issued"
        code="7K3M9PXQ"
        moNumber="16663538"
        onSent={onSent}
      />,
    );
    await user.click(screen.getByRole('button', { name: '문자를 보냈어요' }));
    expect(onSent).toHaveBeenCalled();
  });

  it('코드 복사 버튼이 clipboard 에 코드를 쓴다', async () => {
    const user = userEvent.setup();
    // userEvent.setup() 이 navigator.clipboard 를 자체 스텁으로 덮어쓰므로, 반드시 setup 이후에 정의한다.
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    render(
      <PhoneVerificationField {...baseProps} status="issued" code="7K3M9PXQ" moNumber="16663538" />,
    );
    await user.click(screen.getByRole('button', { name: '코드 복사' }));
    expect(writeText).toHaveBeenCalledWith('7K3M9PXQ');
  });

  it('waiting 에서 확인 중 텍스트가 보인다', () => {
    render(
      <PhoneVerificationField
        {...baseProps}
        status="waiting"
        code="7K3M9PXQ"
        moNumber="16663538"
      />,
    );
    expect(screen.getByText(/확인 중/)).toBeInTheDocument();
  });

  it('재발급 쿨다운 중에는 재발급 버튼이 비활성화된다', () => {
    render(
      <PhoneVerificationField
        {...baseProps}
        status="issued"
        code="7K3M9PXQ"
        moNumber="16663538"
        resendCooldownSeconds={45}
        canIssue={false}
      />,
    );
    expect(screen.getByRole('button', { name: /재발급/ })).toBeDisabled();
  });

  it('verified 에서 인증 완료 문구를 보여준다', () => {
    render(<PhoneVerificationField {...baseProps} status="verified" />);
    expect(screen.getByText(/인증됐어요/)).toBeInTheDocument();
  });

  it('expired 에서 다시 인증 버튼이 onReset 을 호출한다', async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<PhoneVerificationField {...baseProps} status="expired" onReset={onReset} />);
    await user.click(screen.getByRole('button', { name: '다시 인증' }));
    expect(onReset).toHaveBeenCalled();
  });

  it('errorMessage 를 alert 로 노출한다', () => {
    render(<PhoneVerificationField {...baseProps} errorMessage="인증에 실패했어요." />);
    expect(screen.getByRole('alert')).toHaveTextContent('인증에 실패했어요.');
  });
});
