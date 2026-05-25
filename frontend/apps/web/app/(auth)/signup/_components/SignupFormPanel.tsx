'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducer, useState } from 'react';
import { useSignupMutation } from '@duing/hooks';
import { signupSchema } from '@duing/schemas';
import { initialSignupState, signupReducer, type SignupFormState } from '../_lib/signup-state';
import { CollegeSelect } from './CollegeSelect';
import { GradeSelect } from './GradeSelect';
import { PhoneInput } from './PhoneInput';
import { TermsAgreement } from './TermsAgreement';
import type { College, Grade } from '@duing/types';

const inputCls =
  'w-full rounded-md border border-line bg-paper px-3.5 py-3 text-sm text-charcoal outline-none transition focus:border-ink focus:ring-1 focus:ring-ink/20 placeholder:text-charcoal-3/50';

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

function IconPerson() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 13c0-3.3 2.7-5 6-5s6 1.7 6 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 5.5l6.5 4 6.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function SignupFormPanel() {
  const router = useRouter();
  const signup = useSignupMutation();
  const [state, dispatch] = useReducer(signupReducer, initialSignupState);
  const [error, setError] = useState<string | null>(null);

  function setField(field: keyof SignupFormState, value: string | boolean) {
    dispatch({ type: 'SET_FIELD', field, value });
  }

  const passwordMismatch =
    state.passwordConfirm.length > 0 && state.password !== state.passwordConfirm;

  const canSubmit =
    state.termsOfServiceAgreed && state.privacyPolicyAgreed && !signup.isPending && !passwordMismatch;

  async function handleSubmit(submitEvent: React.FormEvent) {
    submitEvent.preventDefault();
    if (passwordMismatch) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
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
    <div className="flex flex-1 flex-col overflow-y-auto bg-cream">
      {/* Top nav bar */}
      <nav className="flex shrink-0 items-center justify-between px-8 pt-6">
        <Link
          href="/"
          className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal"
        >
          <IconChevronLeft />
          홈으로
        </Link>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-charcoal-2 transition-colors hover:text-charcoal"
        >
          한국어
          <IconChevronDown />
        </button>
      </nav>

      {/* Form content */}
      <main className="flex flex-1 justify-center px-8 py-10">
        <div className="w-full max-w-[520px]">
          {/* Badge */}
          <span className="pill mb-5 inline-flex">
            <svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 0l1.5 5.5L14 7l-5.5 1.5L7 14l-1.5-5.5L0 7l5.5-1.5L7 0z"
                fill="currentColor"
              />
            </svg>
            회원가입
          </span>

          <h1 className="mb-2 text-[2rem] font-bold tracking-tightx text-ink-deep">
            대구대 학생 정보 입력
          </h1>
          <p className="mb-8 text-sm text-charcoal-2">
            한 번에 입력하면 곧, 가입 즉시 동아리를 둘러볼 수 있어요.
          </p>

          {/* Error message */}
          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-5 rounded-md border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral"
            >
              {error}
            </div>
          )}

          <form className="space-y-4" onSubmit={handleSubmit}>
            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-charcoal">
                학교 이메일
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-charcoal-3">
                  <IconMail />
                </span>
                <input
                  id="signup-email"
                  required
                  type="email"
                  autoComplete="username"
                  autoFocus
                  value={state.email}
                  onChange={(changeEvent) => setField('email', changeEvent.target.value)}
                  placeholder="2021123456@daegu.ac.kr"
                  className={`${inputCls} pl-10`}
                />
              </div>
              <p className="mt-1.5 text-xs text-charcoal-3">@daegu.ac.kr 메일만 가입 가능</p>
            </div>

            {/* Password + Password Confirm */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-charcoal">
                  비밀번호
                </label>
                <input
                  id="signup-password"
                  required
                  type="password"
                  autoComplete="new-password"
                  value={state.password}
                  onChange={(changeEvent) => setField('password', changeEvent.target.value)}
                  placeholder="••••••••"
                  className={inputCls}
                />
                <p className="mt-1.5 text-xs text-charcoal-3">영문+숫자 8자 이상</p>
              </div>
              <div>
                <label htmlFor="signup-password-confirm" className="mb-1.5 block text-sm font-medium text-charcoal">
                  비밀번호 확인
                </label>
                <input
                  id="signup-password-confirm"
                  required
                  type="password"
                  autoComplete="new-password"
                  value={state.passwordConfirm}
                  onChange={(changeEvent) => setField('passwordConfirm', changeEvent.target.value)}
                  placeholder="••••••••"
                  className={inputCls}
                />
                {passwordMismatch && (
                  <p className="mt-1.5 text-xs text-coral" aria-live="polite">
                    비밀번호가 일치하지 않아요
                  </p>
                )}
              </div>
            </div>

            {/* Name */}
            <div>
              <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-charcoal">
                이름
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-charcoal-3">
                  <IconPerson />
                </span>
                <input
                  id="signup-name"
                  required
                  maxLength={50}
                  value={state.name}
                  onChange={(changeEvent) => setField('name', changeEvent.target.value)}
                  placeholder="김도윤"
                  className={`${inputCls} pl-10`}
                />
              </div>
            </div>

            {/* Student ID + Grade */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="signup-student-id" className="mb-1.5 block text-sm font-medium text-charcoal">
                  학번
                </label>
                <input
                  id="signup-student-id"
                  required
                  pattern="\d{7,10}"
                  inputMode="numeric"
                  value={state.studentId}
                  onChange={(changeEvent) => setField('studentId', changeEvent.target.value)}
                  placeholder="2021123456"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="signup-grade" className="mb-1.5 block text-sm font-medium text-charcoal">
                  학년
                </label>
                <GradeSelect
                  value={state.grade}
                  onChange={(grade: Grade) => setField('grade', grade)}
                />
              </div>
            </div>

            {/* College + Major */}
            <div>
              <label htmlFor="signup-college" className="mb-1.5 block text-sm font-medium text-charcoal">
                단과대학·학과
              </label>
              <div className="space-y-2">
                <CollegeSelect
                  value={state.college}
                  onChange={(college: College) => setField('college', college)}
                />
                <input
                  id="signup-major"
                  required
                  maxLength={50}
                  value={state.major}
                  onChange={(changeEvent) => setField('major', changeEvent.target.value)}
                  placeholder="학과명 입력 (예: 컴퓨터정보공학부)"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="signup-phone" className="mb-1.5 block text-sm font-medium text-charcoal">
                전화번호
              </label>
              <PhoneInput
                value={state.phone}
                onChange={(phone) => setField('phone', phone)}
              />
              <p className="mt-1.5 text-xs text-charcoal-3">연락 인증·경력 안내 번호에 사용되요</p>
            </div>

            {/* Terms */}
            <TermsAgreement
              termsOfServiceAgreed={state.termsOfServiceAgreed}
              privacyPolicyAgreed={state.privacyPolicyAgreed}
              onChangeTermsOfService={(next) => setField('termsOfServiceAgreed', next)}
              onChangePrivacyPolicy={(next) => setField('privacyPolicyAgreed', next)}
            />

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn btn-primary btn-big mt-2 w-full disabled:opacity-50"
            >
              {signup.isPending ? '가입 중…' : '가입하고 두잉 시작하기 →'}
            </button>
          </form>

          {/* Bottom link */}
          <p className="mt-6 text-center text-sm text-charcoal-2">
            이미 두잉 계정이 있으신가요?{' '}
            <Link
              href="/login"
              className="font-medium text-charcoal underline underline-offset-2 transition-colors hover:text-ink"
            >
              로그인
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
