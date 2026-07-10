'use client';

import { buildSmsDeeplink, formatSeconds, isIosUserAgent, isMobileUserAgent } from '../_lib/phone-verification';
import type { PhoneVerificationFieldStatus } from '../_lib/use-phone-verification';
import { PhoneInput } from './PhoneInput';

type Props = {
  phone: string;
  onPhoneChange: (next: string) => void;
  status: PhoneVerificationFieldStatus;
  code: string;
  moNumber: string;
  qrCode: string | null;
  remainingSeconds: number;
  resendCooldownSeconds: number;
  issuing: boolean;
  canIssue: boolean;
  errorMessage: string | null;
  stalled: boolean;
  onIssue: (includeQr: boolean) => void;
  onSent: () => void;
  onReset: () => void;
  onRecheck: () => void;
};

/** moNumber(8자리 숫자 문자열)를 "1666-3538" 형태로 표시한다. 형식이 다르면 원본을 그대로 보여준다. */
function formatMoNumber(rawNumber: string): string {
  if (!/^\d{8}$/.test(rawNumber)) return rawNumber;
  return `${rawNumber.slice(0, 4)}-${rawNumber.slice(4)}`;
}

export function PhoneVerificationField({
  phone,
  onPhoneChange,
  status,
  code,
  moNumber,
  qrCode,
  remainingSeconds,
  resendCooldownSeconds,
  issuing,
  canIssue,
  errorMessage,
  stalled,
  onIssue,
  onSent,
  onReset,
  onRecheck,
}: Props) {
  const isMobile = typeof navigator !== 'undefined' && isMobileUserAgent(navigator.userAgent);
  const isIos = typeof navigator !== 'undefined' && isIosUserAgent(navigator.userAgent);

  const verified = status === 'verified';
  const showIssuedFields = status === 'issued' || status === 'waiting';

  function handleCopyCode() {
    void navigator.clipboard.writeText(code);
  }

  return (
    <div>
      {errorMessage && (
        <p role="alert" className="mb-3 rounded-md bg-coral/5 px-3 py-2 text-sm text-coral">
          {errorMessage}
        </p>
      )}

      {status === 'idle' && (
        <div>
          <label htmlFor="signup-phone" className="mb-1.5 block text-sm font-medium text-charcoal">
            휴대폰 번호
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <PhoneInput value={phone} onChange={onPhoneChange} />
            </div>
            <button
              type="button"
              disabled={!canIssue}
              onClick={() => onIssue(!isMobile)}
              className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              {issuing ? '발급 중…' : '인증 시작'}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-charcoal-3">번호로 인증코드를 문자 전송해 주세요</p>
        </div>
      )}

      {showIssuedFields && (
        <div>
          <label htmlFor="signup-phone-locked" className="mb-1.5 block text-sm font-medium text-charcoal">
            휴대폰 번호
          </label>
          <input
            id="signup-phone-locked"
            readOnly
            value={phone}
            className="w-full rounded-md border border-line bg-line/30 px-3.5 py-3 text-sm text-charcoal-3 outline-none"
          />

          <div className="mt-3 rounded-md border border-line bg-paper p-3.5">
            <p className="text-xs text-charcoal-3">수신번호 {formatMoNumber(moNumber)}</p>
            <div className="mt-1.5 flex items-center gap-3">
              <span className="font-mono text-2xl font-bold tracking-wide text-ink">{code}</span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="btn btn-sm shrink-0 whitespace-nowrap"
              >
                코드 복사
              </button>
            </div>
            <p className="mt-1.5 text-xs text-charcoal-3">남은 시간 {formatSeconds(remainingSeconds)}</p>
          </div>

          {isMobile ? (
            <a
              href={buildSmsDeeplink(moNumber, code, isIos)}
              onClick={onSent}
              className="btn btn-secondary mt-3 w-full"
            >
              문자 앱으로 보내기
            </a>
          ) : qrCode ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrCode} alt="문자 전송 QR" className="mt-3 h-32 w-32" />
          ) : (
            <p className="mt-3 text-xs text-charcoal-3">
              QR 코드를 표시할 수 없어요. 위 수신번호로 코드를 그대로 문자로 보내주세요.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onSent} className="btn btn-primary flex-1">
              문자를 보냈어요
            </button>
            <button
              type="button"
              disabled={!canIssue}
              onClick={() => onIssue(!isMobile)}
              className="btn shrink-0 whitespace-nowrap disabled:opacity-50"
            >
              재발급{resendCooldownSeconds > 0 ? ` (${resendCooldownSeconds}s)` : ''}
            </button>
          </div>

          <p className="mt-1.5 text-xs text-charcoal-3">
            메시지를 수정 없이 그대로 보내주세요 · 요금제에 따라 문자 요금이 발생할 수 있어요
          </p>

          {status === 'waiting' &&
            (stalled ? (
              <>
                <p className="mt-1.5 text-xs text-coral" aria-live="polite">
                  아직 확인되지 않았어요. 문자에 코드만 담아 그대로 보냈는지 확인하고, 문자 도착 후 아래 [지금 확인]을 누르거나, 계속 안 되면 재발급하세요.
                </p>
                <button type="button" onClick={onRecheck} className="btn btn-sm mt-2">
                  지금 확인
                </button>
              </>
            ) : (
              <p className="mt-1.5 text-xs text-charcoal-3" aria-live="polite">
                확인 중…
              </p>
            ))}
        </div>
      )}

      {verified && (
        <div>
          <p className="text-sm font-medium text-emerald-600">✓ 이 번호로 인증됐어요</p>
          <p className="mt-1 text-sm text-charcoal-3">{phone}</p>
        </div>
      )}

      {status === 'expired' && (
        <div>
          <p className="text-sm text-charcoal-3">시간이 초과됐어요. 다시 인증해주세요.</p>
          <button type="button" onClick={onReset} className="btn btn-primary mt-2">
            다시 인증
          </button>
        </div>
      )}
    </div>
  );
}
