'use client';

import { useEffect, useRef, useState } from 'react';
import {
  usePhoneVerificationStatusQuery,
  useStartPhoneVerificationMutation,
} from '@duing/hooks';
import type { PhoneVerificationSession } from '@duing/types';
import { RESEND_COOLDOWN_SECONDS, mapIssueError, mapStatusError } from './phone-verification';

export type PhoneVerificationFieldStatus = 'idle' | 'issued' | 'waiting' | 'verified' | 'expired';

const PHONE_PATTERN = /^010-\d{4}-\d{4}$/;

/**
 * 회원가입 휴대폰 MO 인증 상태 머신.
 * idle → (발급) → issued → (문자를 보냈어요) → waiting → (폴링 VERIFIED) → verified.
 * remainingSeconds 만료 또는 폴링 EXPIRED 시 expired 로 전이한다.
 * phone 이 바뀌면 idle 로 리셋(verified 였어도 — 검증된 번호가 아닌 다른 번호로 가입되는 것을
 * 막기 위한 UX 정합. 최종 방어는 서버가 세션에 귀속된 번호 기준으로 한다).
 */
export function usePhoneVerification(phone: string) {
  const startMutation = useStartPhoneVerificationMutation();
  const [status, setStatus] = useState<PhoneVerificationFieldStatus>('idle');
  const [session, setSession] = useState<PhoneVerificationSession | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previousPhoneRef = useRef(phone);
  useEffect(() => {
    if (previousPhoneRef.current === phone) return;
    previousPhoneRef.current = phone;
    setStatus('idle');
    setSession(null);
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
  }, [phone]);

  const poll = usePhoneVerificationStatusQuery(session?.verificationToken ?? null, {
    enabled: status === 'waiting',
  });

  // 폴링 결과 반영 — VERIFIED/EXPIRED 로 확정되면 상태를 전이한다(PENDING 은 폴링을 계속한다).
  useEffect(() => {
    const polledStatus = poll.data?.status;
    if (polledStatus === 'VERIFIED') {
      setStatus('verified');
    } else if (polledStatus === 'EXPIRED') {
      setStatus('expired');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poll.data?.status]);

  // 폴링(status==='waiting') 단계에서만 유효한 에러 처리. 일시적 폴링 실패는 에러를 띄우고,
  // 이후 성공 폴링(PENDING/VERIFIED)이 오면 다시 null 로 지운다(성공 후에도 배너가 남지 않도록).
  // status 가드로 issue/발급 단계에서 세팅한 errorMessage(mapIssueError)를 이 effect 가 덮어쓰지 않게 분리한다.
  useEffect(() => {
    if (status !== 'waiting') return;
    setErrorMessage(poll.error ? mapStatusError(poll.error) : null);
  }, [status, poll.error]);

  // 1초 틱 — 만료·재발급 쿨다운 카운트다운
  useEffect(() => {
    if (status !== 'issued' && status !== 'waiting') return;
    const timerId = setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
      setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timerId);
  }, [status]);

  // remainingSeconds 가 0 이 되면 만료로 전이
  useEffect(() => {
    if ((status === 'issued' || status === 'waiting') && remainingSeconds === 0) {
      setStatus('expired');
    }
  }, [status, remainingSeconds]);

  async function issue(includeQr: boolean) {
    if (!PHONE_PATTERN.test(phone)) {
      setErrorMessage('휴대폰 번호 형식이 올바르지 않아요.');
      return;
    }
    setErrorMessage(null);
    try {
      const issuedSession = await startMutation.mutateAsync({ payload: { phone }, includeQr });
      setSession(issuedSession);
      setStatus('issued');
      setRemainingSeconds(issuedSession.expiresInSeconds);
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (issueError) {
      setErrorMessage(mapIssueError(issueError));
    }
  }

  function markSent() {
    if (status !== 'issued') return;
    setStatus('waiting');
  }

  function reset() {
    setStatus('idle');
    setSession(null);
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
  }

  const canIssue =
    PHONE_PATTERN.test(phone) &&
    !startMutation.isPending &&
    status !== 'verified' &&
    resendCooldownSeconds === 0;

  return {
    status,
    verified: status === 'verified',
    session,
    verificationToken: session?.verificationToken ?? null,
    code: session?.code ?? '',
    moNumber: session?.moNumber ?? '',
    qrCode: session?.qrCode ?? null,
    remainingSeconds,
    resendCooldownSeconds,
    issuing: startMutation.isPending,
    canIssue,
    errorMessage,
    issue,
    markSent,
    reset,
  };
}
