'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useConfirmEmailVerificationMutation,
  useSendEmailVerificationMutation,
} from '@duing/hooks';
import { schoolEmailSchema } from '@duing/schemas';
import {
  RESEND_COOLDOWN_SECONDS,
  mapConfirmError,
  mapSendError,
} from './email-verification';

export type EmailVerificationStatus = 'idle' | 'codeSent' | 'verified';

/**
 * 회원가입 이메일 인증 상태 머신.
 * idle → (발송) → codeSent → (확인) → verified. 이메일이 바뀌면 idle 로 리셋.
 */
export function useEmailVerification(email: string) {
  const sendMutation = useSendEmailVerificationMutation();
  const confirmMutation = useConfirmEmailVerificationMutation();
  const [status, setStatus] = useState<EmailVerificationStatus>('idle');
  const [code, setCode] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 이메일이 바뀌면 인증 상태 리셋 (spec §8.1-4)
  const previousEmailRef = useRef(email);
  useEffect(() => {
    if (previousEmailRef.current === email) return;
    previousEmailRef.current = email;
    setStatus('idle');
    setCode('');
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
  }, [email]);

  // 1초 틱 — 만료·재발송 카운트다운
  useEffect(() => {
    if (status !== 'codeSent') return;
    const timerId = setInterval(() => {
      setRemainingSeconds((seconds) => Math.max(0, seconds - 1));
      setResendCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => clearInterval(timerId);
  }, [status]);

  const emailValid = schoolEmailSchema.safeParse(email).success;

  async function send() {
    setErrorMessage(null);
    try {
      const sendResult = await sendMutation.mutateAsync({ email });
      setStatus('codeSent');
      setCode('');
      setRemainingSeconds(sendResult.expiresInSeconds);
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (sendError) {
      setErrorMessage(mapSendError(sendError));
    }
  }

  async function confirm() {
    if (code.length !== 6 || remainingSeconds === 0) {
      return; // 6자리 미만이거나 만료 상태면 시도하지 않는다(인증 시도 낭비 방지)
    }
    setErrorMessage(null);
    try {
      await confirmMutation.mutateAsync({ email, code });
      setStatus('verified');
    } catch (confirmError) {
      setErrorMessage(mapConfirmError(confirmError));
    }
  }

  function reset() {
    setStatus('idle');
    setCode('');
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
  }

  return {
    status,
    verified: status === 'verified',
    code,
    setCode,
    remainingSeconds,
    resendCooldownSeconds,
    sending: sendMutation.isPending,
    confirming: confirmMutation.isPending,
    // 발송/재발송 공통 게이트: 유효 이메일 + 발송중 아님 + 인증완료 아님 + 쿨다운 끝남
    canSend: emailValid && !sendMutation.isPending && status !== 'verified' && resendCooldownSeconds === 0,
    // 확인 가능: 코드 발송됨 + 6자리 + 만료 전 + 확인중 아님
    canConfirm: status === 'codeSent' && code.length === 6 && remainingSeconds > 0 && !confirmMutation.isPending,
    errorMessage,
    send,
    confirm,
    reset,
  };
}
