'use client';

import Link from 'next/link';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import { useReducer, useState } from 'react';
import { useSignupMutation } from '@duing/hooks';
import { signupSchema } from '@duing/schemas';
import { ApiError } from '@duing/api';
import { initialSignupState, signupReducer, type SignupFormState } from '../_lib/signup-state';
import { usePhoneVerification } from '@/app/_lib/use-phone-verification';
import { SignupStepIndicator } from './SignupStepIndicator';
import { SignupStepVerify } from './SignupStepVerify';
import { SignupStepProfile } from './SignupStepProfile';
import posthog from 'posthog-js';

function IconChevronLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SignupFormPanel() {
  const router = useGuardedRouter();
  const signup = useSignupMutation();
  const [state, dispatch] = useReducer(signupReducer, initialSignupState);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof SignupFormState, value: string | boolean) {
    dispatch({ type: 'SET_FIELD', field, value });
  }

  const phoneVerification = usePhoneVerification(state.phone);

  const passwordMismatch =
    state.passwordConfirm.length > 0 && state.password !== state.passwordConfirm;
  const studentIdMismatch =
    state.studentIdConfirm.length > 0 && state.studentId !== state.studentIdConfirm;

  const canSubmit =
    state.termsOfServiceAgreed &&
    state.privacyPolicyAgreed &&
    !signup.isPending &&
    !passwordMismatch &&
    state.studentId === state.studentIdConfirm &&
    phoneVerification.verified;

  async function handleSubmit(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    // Step1 에서 Enter 등으로 form submit 이 발생해도 제출하지 않는다(전환은 [다음] 버튼 전용).
    if (step !== 2) return;
    if (passwordMismatch) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    if (state.studentId !== state.studentIdConfirm) {
      setError('학번이 일치하지 않습니다.');
      return;
    }
    setError(null);
    const parsed = signupSchema.safeParse({
      studentId: state.studentId,
      name: state.name,
      password: state.password,
      grade: state.grade,
      college: state.college,
      major: state.major,
      verificationToken: phoneVerification.verificationToken ?? '',
      termsOfServiceAgreed: state.termsOfServiceAgreed,
      privacyPolicyAgreed: state.privacyPolicyAgreed,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await signup.mutateAsync(parsed.data);
      posthog.identify(parsed.data.studentId);
      posthog.capture('user_signed_up', { college: parsed.data.college, grade: parsed.data.grade });
      router.replace('/login?next=/me');
    } catch (signupError) {
      if (signupError instanceof ApiError && signupError.code === 'PHONE_NOT_VERIFIED') {
        phoneVerification.reset();
        setStep(1);
        setError('휴대폰 인증이 만료됐어요. 다시 인증해주세요.');
        return;
      }
      setError(signupError instanceof Error ? signupError.message : '회원가입에 실패했습니다.');
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-cream">
      <nav className="flex shrink-0 items-center justify-between px-8 pt-6">
        <Link href="/" className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal">
          <IconChevronLeft />
          홈으로
        </Link>
        <button type="button" className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal">
          한국어
          <IconChevronDown />
        </button>
      </nav>

      <main className="flex flex-1 justify-center px-8 py-10">
        <div className="w-full max-w-[520px]">
          <span className="pill mb-5 inline-flex">
            <svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M7 0l1.5 5.5L14 7l-5.5 1.5L7 14l-1.5-5.5L0 7l5.5-1.5L7 0z" fill="currentColor" />
            </svg>
            회원가입
          </span>

          <SignupStepIndicator step={step} />

          {error && (
            <div role="alert" aria-live="polite" className="mb-5 rounded-md border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {step === 1 ? (
              <SignupStepVerify
                phone={state.phone}
                onPhoneChange={(phone) => setField('phone', phone)}
                verification={phoneVerification}
                onNext={() => setStep(2)}
              />
            ) : (
              <SignupStepProfile
                state={state}
                setField={setField}
                passwordMismatch={passwordMismatch}
                studentIdMismatch={studentIdMismatch}
                canSubmit={canSubmit}
                isSubmitting={signup.isPending}
                onBack={() => setStep(1)}
              />
            )}
          </form>

          <p className="mt-6 text-center text-sm text-charcoal-2">
            이미 두잉 계정이 있으신가요?{' '}
            <Link href="/login" className="font-medium text-charcoal underline underline-offset-2 transition-colors hover:text-ink">
              로그인
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
