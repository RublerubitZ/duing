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
  stalled: false,
  onIssue: () => {},
  onSent: () => {},
  onReset: () => {},
  onRecheck: () => {},
};

// 컴포넌트는 navigator.userAgent 로 모바일/iOS 를 판정한다. jsdom 기본 UA 는 비모바일이므로
// 모바일 분기 검증 시에만 오버라이드하고, 각 테스트 후 원래 프로토타입 getter 로 복원한다.
function stubUserAgent(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
}
function restoreUserAgent() {
  Reflect.deleteProperty(navigator, 'userAgent');
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

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

  it('모바일 UA 에서 issued 면 처음엔 [문자앱으로 코드 보내기] 하나만 노출한다', () => {
    stubUserAgent(IPHONE_UA);
    try {
      render(
        <PhoneVerificationField
          {...baseProps}
          status="issued"
          code="7K3M9PXQ"
          moNumber="16663538"
        />,
      );
      const smsLink = screen.getByRole('link', { name: '문자앱으로 코드 보내기' });
      // iOS 는 비표준 `&body=` 구분자를 쓴다(buildSmsDeeplink 의 ios 분기).
      expect(smsLink).toHaveAttribute('href', 'sms:16663538&body=7K3M9PXQ');
      // 탭 전에는 보냈어요/재발급이 숨겨져 있다.
      expect(screen.queryByRole('button', { name: '문자를 보냈어요' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /재발급/ })).not.toBeInTheDocument();
    } finally {
      restoreUserAgent();
    }
  });

  it('모바일에서 딥링크를 누르면 보냈어요·재발급이 나타나고 보냈어요가 onSent 를 호출한다', async () => {
    stubUserAgent(IPHONE_UA);
    try {
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
      // 딥링크 탭 = 문자앱 열기 + 버튼 노출(폴링 시작 아님, onSent 아직 호출 안 됨).
      await user.click(screen.getByRole('link', { name: '문자앱으로 코드 보내기' }));
      expect(onSent).not.toHaveBeenCalled();
      const sentButton = screen.getByRole('button', { name: '문자를 보냈어요' });
      expect(screen.getByRole('button', { name: /재발급/ })).toBeInTheDocument();
      await user.click(sentButton);
      expect(onSent).toHaveBeenCalled();
    } finally {
      restoreUserAgent();
    }
  });

  it('데스크톱 UA 에서 qrCode 가 있으면 QR 이미지를 노출한다', () => {
    stubUserAgent(DESKTOP_UA);
    try {
      render(
        <PhoneVerificationField
          {...baseProps}
          status="issued"
          code="7K3M9PXQ"
          moNumber="16663538"
          qrCode="data:image/png;base64,iVBORw0KGgo="
        />,
      );
      const qrImage = screen.getByRole('img', { name: '문자 전송 QR' });
      expect(qrImage).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
      // 데스크톱에서는 sms 딥링크 앵커가 없어야 한다.
      expect(screen.queryByRole('link', { name: '문자앱으로 코드 보내기' })).not.toBeInTheDocument();
    } finally {
      restoreUserAgent();
    }
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

  it('waiting 이고 stalled 가 false 면 "확인 중…"을 보여준다', () => {
    render(
      <PhoneVerificationField
        {...baseProps}
        status="waiting"
        code="7K3M9PXQ"
        moNumber="16663538"
        stalled={false}
      />,
    );
    expect(screen.getByText(/확인 중/)).toBeInTheDocument();
  });

  it('waiting 이고 stalled 가 true 면 능동 안내(재발급 유도) 문구를 보여주고 "확인 중…"은 없다', () => {
    render(
      <PhoneVerificationField
        {...baseProps}
        status="waiting"
        code="7K3M9PXQ"
        moNumber="16663538"
        stalled={true}
      />,
    );
    expect(screen.getByText(/아직 확인되지 않았어요/)).toBeInTheDocument();
    expect(screen.queryByText(/확인 중/)).not.toBeInTheDocument();
  });

  it('waiting+stalled 이면 지금 확인 버튼을 보여주고 클릭 시 onRecheck 를 호출한다', async () => {
    const onRecheck = vi.fn();
    const user = userEvent.setup();
    render(
      <PhoneVerificationField
        {...baseProps}
        status="waiting"
        code="7K3M9PXQ"
        moNumber="16663538"
        stalled={true}
        onRecheck={onRecheck}
      />,
    );
    await user.click(screen.getByRole('button', { name: '지금 확인' }));
    expect(onRecheck).toHaveBeenCalled();
  });

  it('waiting 이지만 stalled 가 false 면 지금 확인 버튼이 없다', () => {
    render(
      <PhoneVerificationField
        {...baseProps}
        status="waiting"
        code="7K3M9PXQ"
        moNumber="16663538"
        stalled={false}
      />,
    );
    expect(screen.queryByRole('button', { name: '지금 확인' })).not.toBeInTheDocument();
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

  it('모바일에서 재발급으로 코드가 바뀌면 다시 CTA만 남고 보냈어요는 숨는다', async () => {
    stubUserAgent(IPHONE_UA);
    try {
      const user = userEvent.setup();
      const { rerender } = render(
        <PhoneVerificationField {...baseProps} status="issued" code="7K3M9PXQ" moNumber="16663538" />,
      );
      await user.click(screen.getByRole('link', { name: '문자앱으로 코드 보내기' }));
      expect(screen.getByRole('button', { name: '문자를 보냈어요' })).toBeInTheDocument();
      // 재발급으로 새 코드가 오면 linkOpened 가 리셋되어 다시 CTA 만 남는다.
      rerender(
        <PhoneVerificationField {...baseProps} status="issued" code="NEWCODE9" moNumber="16663538" />,
      );
      expect(screen.queryByRole('button', { name: '문자를 보냈어요' })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: '문자앱으로 코드 보내기' })).toBeInTheDocument();
    } finally {
      restoreUserAgent();
    }
  });

  it('errorMessage 를 alert 로 노출한다', () => {
    render(<PhoneVerificationField {...baseProps} errorMessage="인증에 실패했어요." />);
    expect(screen.getByRole('alert')).toHaveTextContent('인증에 실패했어요.');
  });
});
