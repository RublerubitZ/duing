'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducer, useState } from 'react';
import { useSignupMutation } from '@duing/hooks';
import { signupSchema } from '@duing/schemas';
import { SignupStepAccount } from './_components/SignupStepAccount';
import { SignupStepProfile } from './_components/SignupStepProfile';
import {
  initialSignupState,
  signupReducer,
  type SignupFormState,
} from './_lib/signup-state';

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignupMutation();
  const [state, dispatch] = useReducer(signupReducer, initialSignupState);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof SignupFormState, value: string | boolean) {
    dispatch({ type: 'SET_FIELD', field, value });
  }

  function goToStep2() {
    setError(null);
    if (state.password !== state.passwordConfirm) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    const step1 = signupSchema
      .pick({ email: true, password: true })
      .safeParse({ email: state.email, password: state.password });
    if (!step1.success) {
      setError(step1.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    setStep(2);
  }

  async function handleSubmit() {
    setError(null);
    const parsed = signupSchema.safeParse({
      studentId: state.studentId,
      name: state.name,
      email: state.email,
      password: state.password,
      grade: state.grade,
      college: state.college,
      major: state.major,
      phone: state.phone,
      termsOfServiceAgreed: state.termsOfServiceAgreed,
      privacyPolicyAgreed: state.privacyPolicyAgreed,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await signup.mutateAsync(parsed.data);
      router.replace('/login?next=/me');
    } catch (err) {
      setError(err instanceof Error ? err.message : '회원가입에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">회원가입</h1>
        <span className="text-sm text-slate-500">{step} / 2 단계</span>
      </header>
      {step === 1 ? (
        <SignupStepAccount
          state={state}
          onField={(field, value) => setField(field, value)}
          onNext={goToStep2}
          error={error}
        />
      ) : (
        <SignupStepProfile
          state={state}
          onField={(field, value) => setField(field, value)}
          onBack={() => {
            setError(null);
            setStep(1);
          }}
          onSubmit={handleSubmit}
          submitting={signup.isPending}
          error={error}
        />
      )}
      <p className="text-center text-sm text-slate-500">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-slate-900 underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
