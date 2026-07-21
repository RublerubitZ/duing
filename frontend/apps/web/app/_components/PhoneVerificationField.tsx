'use client';

import { useEffect, useState } from 'react';
import { buildSmsDeeplink, formatSeconds, isIosUserAgent, isMobileUserAgent } from '@/app/_lib/phone-verification';
import type { PhoneVerificationFieldStatus } from '@/app/_lib/use-phone-verification';
import { ButtonSpinner } from '@/components/loading/Spinner';
import { PhoneInput } from './PhoneInput';
import { SignupIllustration } from './SignupIllustration';

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
  rechecking: boolean;
  recheckCooldownSeconds: number;
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
  rechecking,
  recheckCooldownSeconds,
  onIssue,
  onSent,
  onReset,
  onRecheck,
}: Props) {
  const isMobile = typeof navigator !== 'undefined' && isMobileUserAgent(navigator.userAgent);
  const isIos = typeof navigator !== 'undefined' && isIosUserAgent(navigator.userAgent);

  const verified = status === 'verified';
  const showIssuedFields = status === 'issued' || status === 'waiting';

  // 모바일 점진 노출: 딥링크(문자앱 열기)를 한 번 눌러야 [문자를 보냈어요]·[재발급]이 나타난다.
  const [linkOpened, setLinkOpened] = useState(false);
  // 새 코드가 발급되면(재발급 포함) 처음 상태로 되돌린다.
  useEffect(() => {
    setLinkOpened(false);
  }, [code]);

  function handleCopyCode() {
    void navigator.clipboard.writeText(code);
  }

  // 대기 안내 — 버튼이 상태(확인 중/지금 확인)를 직접 표현하므로 여기는 보조 안내만 남긴다.
  const waitingNotice =
    status === 'waiting' ? (
      stalled ? (
        <p className="mt-3 text-xs text-coral" aria-live="polite">
          아직 확인되지 않았어요. 문자에 인증 코드만 포함되어 있는지 확인해주세요. 문자를 보냈다면 [지금
          확인]을, 계속 안 되면 [재발급]을 눌러주세요.
        </p>
      ) : (
        <p role="status" className="mt-3 text-xs text-charcoal-3">
          문자 도착을 자동으로 확인하고 있어요. 화면을 벗어나지 말고 잠시만 기다려주세요.
        </p>
      )
    ) : null;

  // 주 액션 버튼 상태 머신 — [문자를 보냈어요] → (클릭) → [확인 중… 스피너·비활성] → (40초) → [지금 확인].
  // 요청이 접수됐음을 버튼만 보고 알 수 있게 하고, 중복 클릭·연타를 버튼 수준에서 차단한다.
  const recheckDisabled = rechecking || recheckCooldownSeconds > 0;
  const primaryAction =
    status === 'waiting' ? (
      stalled ? (
        <button
          type="button"
          onClick={onRecheck}
          disabled={recheckDisabled}
          className="btn btn-primary flex-1"
        >
          {rechecking && <ButtonSpinner />}
          지금 확인{!rechecking && recheckCooldownSeconds > 0 ? ` (${recheckCooldownSeconds}s)` : ''}
        </button>
      ) : (
        <button type="button" disabled aria-label="인증 확인 중" className="btn btn-primary flex-1">
          <ButtonSpinner />
          확인 중…
        </button>
      )
    ) : (
      <button type="button" onClick={onSent} className="btn btn-primary flex-1">
        문자를 보냈어요
      </button>
    );

  // 주 액션 + [재발급] 행 (데스크톱 상시 / 모바일 탭 후).
  const actionRow = (
    <div className="mt-3 flex gap-2">
      {primaryAction}
      <button
        type="button"
        disabled={!canIssue}
        onClick={() => onIssue(!isMobile)}
        className="btn shrink-0 whitespace-nowrap"
      >
        재발급{resendCooldownSeconds > 0 ? ` (${resendCooldownSeconds}s)` : ''}
      </button>
    </div>
  );

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
              className="btn shrink-0 whitespace-nowrap"
            >
              {issuing && <ButtonSpinner />}인증 시작
            </button>
          </div>
          <p className="mt-1.5 text-xs text-charcoal-3">번호로 인증코드를 문자 전송해 주세요</p>
        </div>
      )}

      {showIssuedFields && !isMobile && (
        // 데스크톱: QR 메인 2단
        <div>
          <div className="grid grid-cols-[168px_1fr] items-center gap-5 rounded-md border border-line bg-paper p-4">
            <div className="text-center">
              {qrCode ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrCode} alt="문자 전송 QR" className="mx-auto h-40 w-40 rounded-lg border border-line" />
              ) : (
                <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-lg border border-line bg-graysoft px-3 text-center text-xs text-charcoal-3">
                  QR을 표시할 수 없어요. 아래 수신번호로 코드를 그대로 문자로 보내주세요.
                </div>
              )}
              <p className="mt-2 text-xs font-semibold text-ink">① QR 촬영</p>
            </div>
            {/* min-w-0: 그리드 자식의 min-content 확장으로 박스가 좁은 컨테이너(다이얼로그) 밖으로 밀려나는 것을 막는다. */}
            <div className="min-w-0">
              <p className="text-xs text-charcoal-3">수신번호 {formatMoNumber(moNumber)}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <span className="font-mono text-2xl font-bold tracking-wide text-ink">{code}</span>
                <button type="button" onClick={handleCopyCode} className="btn btn-sm shrink-0 whitespace-nowrap">
                  코드 복사
                </button>
              </div>
              <p className="mt-1.5 text-xs text-charcoal-3">남은 시간 {formatSeconds(remainingSeconds)}</p>
              {/* 줄바꿈이 단계 중간이 아니라 단계 사이에서만 일어나도록 각 단계를 nowrap 으로 묶는다. */}
              <p className="mt-2 text-xs text-charcoal-3">
                <span className="whitespace-nowrap">② 문자앱에서 →</span>{' '}
                <span className="whitespace-nowrap">③ 그대로 전송 →</span>{' '}
                <span className="whitespace-nowrap font-semibold text-ink-soft">✓ 자동 인증</span>
              </p>
            </div>
          </div>
          {actionRow}
          <p className="mt-2 text-xs text-charcoal-3">
            메시지를 수정 없이 그대로 보내주세요 · 요금제에 따라 문자 요금이 발생할 수 있어요
          </p>
          {waitingNotice}
        </div>
      )}

      {showIssuedFields && isMobile && (
        // 모바일: 일러스트 → CTA 우선 점진 노출 → 직접 보내기 fallback
        <div>
          <SignupIllustration className="mx-auto w-full max-w-[240px]" />

          {!linkOpened ? (
            <>
              <a
                href={buildSmsDeeplink(moNumber, code, isIos)}
                onClick={() => setLinkOpened(true)}
                className="btn btn-primary btn-big mt-3 flex w-full items-center justify-center"
              >
                문자앱으로 코드 보내기
              </a>
              <p className="mt-2 text-center text-xs text-charcoal-3">
                버튼을 누르면 문자 앱이 열리고 수신번호·코드가 자동으로 채워져요. 그대로 보내면 끝!
              </p>
            </>
          ) : (
            <>
              <a
                href={buildSmsDeeplink(moNumber, code, isIos)}
                onClick={() => setLinkOpened(true)}
                className="btn btn-secondary mt-3 flex w-full items-center justify-center"
              >
                문자앱 다시 열기
              </a>
              {actionRow}
              <p className="mt-2 text-center text-xs text-charcoal-3">
                문자를 보낸 뒤 [문자를 보냈어요]를 눌러주세요 · 수정 없이 그대로 전송해야 인증돼요
              </p>
            </>
          )}

          {/* 직접 보내기 fallback (딥링크 미동작 대비) */}
          <div className="mt-4 rounded-md border border-line bg-paper p-3.5 text-center">
            <p className="text-xs text-charcoal-3">수신번호 {formatMoNumber(moNumber)} · 코드</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-wide text-ink">{code}</p>
            <p className="mt-1.5 text-xs text-charcoal-3">남은 시간 {formatSeconds(remainingSeconds)}</p>
            <p className="mt-1.5 text-[11px] text-charcoal-3">
              버튼이 안 열리면 이 코드를 위 번호로 직접 문자 보내주세요
            </p>
          </div>

          {waitingNotice}
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
