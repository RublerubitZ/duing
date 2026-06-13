'use client';

import { formatSeconds } from '../_lib/email-verification';
import type { EmailVerificationStatus } from '../_lib/use-email-verification';

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3.5 py-3 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20 placeholder:text-charcoal-3/50';

type Props = {
  email: string;
  onEmailChange: (email: string) => void;
  status: EmailVerificationStatus;
  code: string;
  onCodeChange: (code: string) => void;
  remainingSeconds: number;
  resendCooldownSeconds: number;
  sending: boolean;
  confirming: boolean;
  canSend: boolean;
  errorMessage: string | null;
  onSend: () => void;
  onConfirm: () => void;
  onEditEmail: () => void;
};

export function EmailVerificationField({
  email,
  onEmailChange,
  status,
  code,
  onCodeChange,
  remainingSeconds,
  resendCooldownSeconds,
  sending,
  confirming,
  canSend,
  errorMessage,
  onSend,
  onConfirm,
  onEditEmail,
}: Props) {
  const verified = status === 'verified';
  const codeSent = status === 'codeSent';
  const expired = codeSent && remainingSeconds === 0;
  const canConfirm = codeSent && !expired && code.length === 6 && !confirming;
  const canResend = resendCooldownSeconds === 0 && !sending;

  return (
    <div>
      <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-charcoal">
        학교 이메일
      </label>
      <div className="flex gap-2">
        <input
          id="signup-email"
          required
          type="email"
          autoComplete="username"
          autoFocus
          readOnly={verified}
          value={email}
          onChange={(changeEvent) => onEmailChange(changeEvent.target.value)}
          placeholder="2021123456@daegu.ac.kr"
          className={`${inputCls} flex-1 ${verified ? 'bg-line/30' : ''}`}
        />
        {!verified && status === 'idle' && (
          <button
            type="button"
            disabled={!canSend}
            onClick={onSend}
            className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
          >
            {sending ? '발송 중…' : '인증코드 발송'}
          </button>
        )}
        {verified && (
          <button
            type="button"
            onClick={onEditEmail}
            className="btn shrink-0 whitespace-nowrap"
          >
            변경
          </button>
        )}
      </div>
      {verified ? (
        <p className="mt-1.5 text-xs font-medium text-emerald-600">인증 완료</p>
      ) : (
        <p className="mt-1.5 text-xs text-charcoal-3">@daegu.ac.kr 메일만 가입 가능</p>
      )}

      {codeSent && (
        <div className="mt-3">
          <label htmlFor="signup-verification-code" className="mb-1.5 block text-sm font-medium text-charcoal">
            인증코드
          </label>
          <div className="flex gap-2">
            <input
              id="signup-verification-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(changeEvent) => onCodeChange(changeEvent.target.value.replace(/\D/g, ''))}
              placeholder="6자리 숫자"
              className={`${inputCls} flex-1`}
            />
            <button
              type="button"
              disabled={!canConfirm}
              onClick={onConfirm}
              className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              {confirming ? '확인 중…' : '확인'}
            </button>
            <button
              type="button"
              disabled={!canResend}
              onClick={onSend}
              className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              재발송{resendCooldownSeconds > 0 ? ` (${resendCooldownSeconds}s)` : ''}
            </button>
          </div>
          {expired ? (
            <p className="mt-1.5 text-xs text-coral" aria-live="polite">
              인증코드가 만료되었어요. 다시 발송해주세요.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-charcoal-3">남은 시간 {formatSeconds(remainingSeconds)}</p>
          )}
        </div>
      )}

      {errorMessage && (
        <p className="mt-1.5 text-xs text-coral" aria-live="polite">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
