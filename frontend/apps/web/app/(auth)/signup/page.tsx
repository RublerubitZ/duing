'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useReducer, useState } from 'react';
import { useSignupMutation } from '@duing/hooks';
import { signupSchema } from '@duing/schemas';
import { CollegeSelect } from './_components/CollegeSelect';
import { GradeSelect } from './_components/GradeSelect';
import { PhoneInput } from './_components/PhoneInput';
import { TermsAgreement } from './_components/TermsAgreement';
import { initialSignupState, signupReducer, type SignupFormState } from './_lib/signup-state';
import type { College, Grade } from '@duing/types';

const BENEFITS = [
  {
    label: '128개 대구대 동아리 정보',
    color: 'bg-sky/30 text-sky',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5l1.3 4H13l-3.5 2.5 1.3 4L7 9.5 3.2 12l1.3-4L1 5.5h4.7L7 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    label: '마감 임박·면접 일정 알람',
    color: 'bg-warm/30 text-warm',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 1.5a4 4 0 014 4v2.5l1 1.5H2l1-1.5V5.5a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M5.5 11.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: '지원서 자동 임시 저장',
    color: 'bg-sage-soft/40 text-ink',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="2" y="1.5" width="10" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4.5 5h5M4.5 7.5h5M4.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    label: '찜한 동아리 모아보기',
    color: 'bg-berry/20 text-berry',
    icon: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <path d="M7 11.5S2 8 2 4.5a2.5 2.5 0 015-0 2.5 2.5 0 015 0C12 8 7 11.5 7 11.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    ),
  },
] as const;

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

export default function SignupPage() {
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
    <div className="duing flex min-h-screen">
      {/* ─── Left decorative panel ─── */}
      <aside className="relative hidden overflow-hidden lg:flex lg:w-[420px] lg:shrink-0 lg:flex-col xl:w-[480px] bg-ink-deep">
        <div className="absolute inset-0 bg-grid opacity-20" />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5 px-8 pt-8">
          <span className="brand-mark">
            <span className="b-d" style={{ color: '#fff' }}>D</span>
            <span className="b-u" style={{ color: 'rgba(157,182,160,0.85)', marginLeft: '-7px' }}>u</span>
            <span className="b-ing" style={{ color: 'rgba(255,255,255,0.75)' }}>ing</span>
            <svg className="b-spark" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path
                d="M7 0l1.5 5.5L14 7l-5.5 1.5L7 14l-1.5-5.5L0 7l5.5-1.5L7 0z"
                fill="rgba(157,182,160,0.75)"
              />
            </svg>
          </span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold tracking-wide06 text-cream/75">
            대구대학교
          </span>
        </div>

        {/* Main copy */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide16 text-sage-soft">
            JOIN DUING
          </p>
          <h2 className="mb-4 text-[2.5rem] font-bold leading-tight tracking-tightx text-paper">
            30초 만에
            <br />
            두잉 시작
          </h2>
          <p className="mb-8 text-sm leading-relaxed text-cream/55">
            대구대학교 학생자치회 공식 동아리 플랫폼.
            <br />
            128개 동아리 · 67곳 이번 학기 모집 중.
          </p>

          {/* Benefits list */}
          <div className="rounded-lg bg-white/8 p-4">
            <p className="mb-3 text-xs font-semibold text-cream/50 tracking-wide04">
              가입하면 바로 누리는 혜택
            </p>
            <ul className="space-y-2.5">
              {BENEFITS.map((benefit) => (
                <li key={benefit.label} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${benefit.color}`}
                    aria-hidden="true"
                  >
                    {benefit.icon}
                  </span>
                  <span className="text-sm text-cream/80">{benefit.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 flex items-center justify-between px-8 pb-6 text-[11px] text-cream/35">
          <span>© 2025 Duing · 대구대학교</span>
          <span className="flex gap-3">
            <span>도움말</span>
            <span>이용약관</span>
          </span>
        </div>
      </aside>

      {/* ─── Right form panel ─── */}
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
    </div>
  );
}
