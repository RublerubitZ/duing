'use client';

import { PhoneVerificationField } from './PhoneVerificationField';
import type { PhoneVerificationController } from '../_lib/use-phone-verification';

type Props = {
  phone: string;
  onPhoneChange: (next: string) => void;
  verification: PhoneVerificationController;
  onNext: () => void;
};

export function SignupStepVerify({ phone, onPhoneChange, verification, onNext }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-2 text-2xl font-bold tracking-tightx text-ink-deep">
          문자로 코드를 보내주세요
        </h2>
        <p className="text-sm leading-relaxed text-charcoal-2">
          아래 코드를 <strong className="text-ink-deep">수신번호로 그대로 전송</strong>하면 발신 번호로
          본인 인증이 완료돼요. 별도 인증번호 입력은 없어요.
        </p>
      </div>

      <PhoneVerificationField
        phone={phone}
        onPhoneChange={onPhoneChange}
        status={verification.status}
        code={verification.code}
        moNumber={verification.moNumber}
        qrCode={verification.qrCode}
        remainingSeconds={verification.remainingSeconds}
        resendCooldownSeconds={verification.resendCooldownSeconds}
        issuing={verification.issuing}
        canIssue={verification.canIssue}
        errorMessage={verification.errorMessage}
        stalled={verification.stalled}
        onIssue={verification.issue}
        onSent={verification.markSent}
        onReset={verification.reset}
        onRecheck={verification.recheck}
      />

      {verification.verified && (
        <button type="button" onClick={onNext} className="btn btn-primary btn-big w-full">
          다음 →
        </button>
      )}
    </div>
  );
}
