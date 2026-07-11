'use client';

import { PhoneVerificationField } from './PhoneVerificationField';
import { SignupIllustration } from './SignupIllustration';
import type { PhoneVerificationController } from '../_lib/use-phone-verification';

type Props = {
  phone: string;
  onPhoneChange: (next: string) => void;
  verification: PhoneVerificationController;
  onNext: () => void;
};

export function SignupStepVerify({ phone, onPhoneChange, verification, onNext }: Props) {
  const { status } = verification;
  // verified 에서는 필드가 완료 배지를 보여주므로 히어로 제목을 숨긴다.
  const showHero = status !== 'verified';
  // idle/expired 에서만 서브 문구 + 일러스트까지 노출(개념 이해 순간). 발급 후엔 제목만 남긴다.
  const showFullHero = status === 'idle' || status === 'expired';

  return (
    <div className="space-y-4">
      {showHero && (
        <div>
          <h2 className="text-[1.75rem] font-bold leading-tight tracking-tightx text-ink-deep">
            문자로 코드를 보내주세요
          </h2>
          {showFullHero && (
            <>
              <p className="mt-1.5 text-sm font-semibold text-ink-soft">문자 한 통이면 본인 인증 끝</p>
              <p className="mt-1 text-sm leading-relaxed text-charcoal-2">
                수신번호로 <strong className="text-ink-deep">그대로 전송</strong>하면 발신번호로 자동 인증돼요.
                인증번호 입력은 필요 없어요.
              </p>
              <SignupIllustration className="mx-auto mt-4 w-full max-w-[360px]" />
            </>
          )}
        </div>
      )}

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
