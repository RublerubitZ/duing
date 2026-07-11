'use client';

import { useEffect, useRef, useState } from 'react';
import {
  useRequestPasswordResetMutation,
  useStartPhoneChangeVerificationMutation,
  useStartPhoneVerificationMutation,
  usePhoneVerificationStatusQuery,
} from '@duing/hooks';
import type { PasswordResetSession, PhoneVerificationSession } from '@duing/types';
import {
  RESEND_COOLDOWN_SECONDS,
  mapIssueError,
  mapPhoneChangeIssueError,
  mapStatusError,
} from './phone-verification';

export type PhoneVerificationFieldStatus = 'idle' | 'issued' | 'waiting' | 'verified' | 'expired';

const PHONE_PATTERN = /^010-\d{4}-\d{4}$/;
const STUDENT_ID_PATTERN = /^\d{8}$/;
const WAITING_STALL_SECONDS = 40;

type CoreOptions<S extends PhoneVerificationSession> = {
  /** 발급 전 검증 — null 이면 통과, 문자열이면 그 메시지로 발급을 막는다. */
  validateBeforeIssue: () => string | null;
  issueSession: (includeQr: boolean) => Promise<S>;
  issueErrorMapper: (error: unknown) => string;
};

/**
 * MO 인증 상태 머신 코어 — signup·번호 변경·비밀번호 재설정이 공유한다.
 * idle → (발급) → issued → (문자를 보냈어요) → waiting → (폴링 VERIFIED) → verified.
 * remainingSeconds 만료 또는 폴링 EXPIRED 시 expired 로 전이한다.
 * resetKey(전화번호·학번)가 바뀌면 idle 로 리셋 — 검증된 대상이 아닌 값으로 완료되는 것을 막는
 * UX 정합이며, 최종 방어는 서버가 세션 귀속 값 기준으로 한다.
 */
function usePhoneVerificationCore<S extends PhoneVerificationSession>(
  resetKey: string,
  { validateBeforeIssue, issueSession, issueErrorMapper }: CoreOptions<S>,
) {
  const [status, setStatus] = useState<PhoneVerificationFieldStatus>('idle');
  const [session, setSession] = useState<S | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [waitingSeconds, setWaitingSeconds] = useState(0);

  const previousKeyRef = useRef(resetKey);
  useEffect(() => {
    if (previousKeyRef.current === resetKey) return;
    previousKeyRef.current = resetKey;
    setStatus('idle');
    setSession(null);
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
    setWaitingSeconds(0);
  }, [resetKey]);

  // 발급(issue) 응답이 도착하기 전에 키가 바뀌면 그 결과를 무시한다 — stale dead-end 방지 (spec §14).
  const latestKeyRef = useRef(resetKey);
  latestKeyRef.current = resetKey;

  // 대기 40초가 지나면 자동 폴링을 멈추고 수동 [지금 확인]으로 전환한다(방치 세션 exists 콜 절감).
  const stalled = status === 'waiting' && waitingSeconds >= WAITING_STALL_SECONDS;

  const poll = usePhoneVerificationStatusQuery(session?.verificationToken ?? null, {
    enabled: status === 'waiting' && !stalled,
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
  // status 가드로 issue/발급 단계에서 세팅한 errorMessage(issueErrorMapper)를 이 effect 가 덮어쓰지 않게 분리한다.
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
      if (status === 'waiting') {
        setWaitingSeconds((seconds) => seconds + 1);
      }
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
    const validationError = validateBeforeIssue();
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    const requestedKey = resetKey;
    setErrorMessage(null);
    setIssuing(true);
    try {
      const issuedSession = await issueSession(includeQr);
      if (latestKeyRef.current !== requestedKey) return; // 키가 바뀜 — stale 응답 무시
      setSession(issuedSession);
      setStatus('issued');
      setRemainingSeconds(issuedSession.expiresInSeconds);
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (issueError) {
      if (latestKeyRef.current !== requestedKey) return; // 키가 바뀜 — stale 에러 무시
      setErrorMessage(issueErrorMapper(issueError));
    } finally {
      setIssuing(false);
    }
  }

  function markSent() {
    if (status !== 'issued') return;
    setWaitingSeconds(0);
    setStatus('waiting');
  }

  function reset() {
    setStatus('idle');
    setSession(null);
    setRemainingSeconds(0);
    setResendCooldownSeconds(0);
    setErrorMessage(null);
    setWaitingSeconds(0);
  }

  // 스톨로 자동 폴링이 멈춘 상태에서 사용자가 문자 도착 후 직접 재확인한다(단발 조회).
  // VERIFIED 면 poll.data effect 가 verified 로 전이하고, PENDING 이면 스톨을 유지한다(자동 재개 없음).
  function recheck() {
    void poll.refetch();
  }

  const canIssue =
    validateBeforeIssue() === null &&
    !issuing &&
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
    stalled,
    issuing,
    canIssue,
    errorMessage,
    issue,
    markSent,
    reset,
    recheck,
  };
}

/** 회원가입 MO 인증 — 공개 발급 엔드포인트(purpose=SIGNUP). 기존 시그니처 불변. */
export function usePhoneVerification(phone: string) {
  const startMutation = useStartPhoneVerificationMutation();
  return usePhoneVerificationCore<PhoneVerificationSession>(phone, {
    validateBeforeIssue: () =>
      PHONE_PATTERN.test(phone) ? null : '휴대폰 번호 형식이 올바르지 않아요.',
    issueSession: (includeQr) => startMutation.mutateAsync({ payload: { phone }, includeQr }),
    issueErrorMapper: mapIssueError,
  });
}

/** 전화번호 변경 재인증 — 본인 JWT 필수 발급 엔드포인트(purpose=PHONE_CHANGE). */
export function usePhoneChangeVerification(phone: string) {
  const startMutation = useStartPhoneChangeVerificationMutation();
  return usePhoneVerificationCore<PhoneVerificationSession>(phone, {
    validateBeforeIssue: () =>
      PHONE_PATTERN.test(phone) ? null : '휴대폰 번호 형식이 올바르지 않아요.',
    issueSession: (includeQr) => startMutation.mutateAsync({ payload: { phone }, includeQr }),
    issueErrorMapper: mapPhoneChangeIssueError,
  });
}

/** 비밀번호 재설정 인증 — 학번으로 시작하고 등록된 번호(마스킹)로만 인증한다 (spec §10.2). */
export function usePasswordResetVerification(studentId: string) {
  const requestMutation = useRequestPasswordResetMutation();
  const controller = usePhoneVerificationCore<PasswordResetSession>(studentId, {
    validateBeforeIssue: () =>
      STUDENT_ID_PATTERN.test(studentId) ? null : '학번은 8자리 숫자여야 해요.',
    issueSession: (includeQr) =>
      requestMutation.mutateAsync({ payload: { studentId }, includeQr }),
    issueErrorMapper: mapIssueError,
  });
  return { ...controller, maskedPhone: controller.session?.maskedPhone ?? null };
}

export type PhoneVerificationController = ReturnType<typeof usePhoneVerification>;
