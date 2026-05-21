'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLoginMutation } from '@duing/hooks';
import { loginSchema } from '@duing/schemas';
import { cn } from '../../_lib/cn';
import { toRoute } from '../../_lib/route';

function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 5.5l6.5 4 6.5-4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="7" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconEye({ crossed }: { crossed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 8s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.2" />
      {crossed && (
        <path d="M2 2l12 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 8.5l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next') ?? '/me';
  const next = /^\/(?!\/)/.test(rawNext) ? toRoute(`/${rawNext.slice(1)}`) : toRoute('/me');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useLoginMutation();

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await login.mutateAsync(parsed.data);
      router.replace(next);
    } catch {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
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
            WELCOME BACK
          </p>
          <h2 className="mb-4 text-[2.5rem] font-bold leading-tight tracking-tightx text-paper">
            다시 만나서
            <br />
            반가워요
          </h2>
          <p className="text-sm leading-relaxed text-cream/55">
            대구대학교 학생자치회 공식 동아리 플랫폼.
            <br />
            128개 동아리 · 67곳 이번 학기 모집 중.
          </p>
        </div>

        {/* Footer */}
        <div className="relative z-10 px-8 pb-6">
          <div className="flex items-center justify-between text-[11px] text-cream/35">
            <span>© 2025 Duing · 대구대학교</span>
            <span className="flex gap-3">
              <span>도움말</span>
              <span>이용약관</span>
            </span>
          </div>
        </div>
      </aside>

      {/* ─── Right form panel ─── */}
      <div className="flex flex-1 flex-col bg-cream">
        {/* Top nav bar */}
        <nav className="flex items-center justify-between px-8 pt-6">
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
        <main className="flex flex-1 items-center justify-center px-8 py-10">
          <div className="w-full max-w-[400px]">
            {/* Badge */}
            <span className="pill mb-5 inline-flex">
              <svg width="9" height="9" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path
                  d="M7 0l1.5 5.5L14 7l-5.5 1.5L7 14l-1.5-5.5L0 7l5.5-1.5L7 0z"
                  fill="currentColor"
                />
              </svg>
              로그인
            </span>

            <h1 className="mb-2 text-[2rem] font-bold tracking-tightx text-ink-deep">
              두잉에 로그인
            </h1>
            <p className="mb-8 text-sm text-charcoal-2">
              대구대학교 학교 이메일로 로그인할 수 있어요.
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
              {/* Email field */}
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-charcoal">
                  학교 이메일
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-charcoal-3">
                    <IconMail />
                  </span>
                  <input
                    id="login-email"
                    required
                    type="email"
                    autoComplete="username"
                    autoFocus
                    value={email}
                    onChange={(changeEvent) => setEmail(changeEvent.target.value)}
                    placeholder="2021123456@daegu.ac.kr"
                    className={cn(
                      'w-full rounded-md border bg-paper py-3 pl-10 pr-10 text-sm text-charcoal outline-none transition',
                      'placeholder:text-charcoal-3/50',
                      'border-line focus:border-ink focus:ring-1 focus:ring-ink/20',
                    )}
                  />
                  {isEmailValid && (
                    <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-ink">
                      <IconCheck />
                    </span>
                  )}
                </div>
              </div>

              {/* Password field */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="text-sm font-medium text-charcoal">
                    비밀번호
                  </label>
                  <a
                    href="/forgot-password"
                    className="text-xs text-charcoal-2 underline underline-offset-2 transition-colors hover:text-charcoal"
                  >
                    비밀번호를 잊으셨나요?
                  </a>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-charcoal-3">
                    <IconLock />
                  </span>
                  <input
                    id="login-password"
                    required
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(changeEvent) => setPassword(changeEvent.target.value)}
                    className={cn(
                      'w-full rounded-md border bg-paper py-3 pl-10 pr-11 text-sm text-charcoal outline-none transition',
                      'border-line focus:border-ink focus:ring-1 focus:ring-ink/20',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                    className="absolute inset-y-0 right-3 flex items-center px-1 text-charcoal-3 transition-colors hover:text-charcoal"
                  >
                    <IconEye crossed={showPassword} />
                  </button>
                </div>
              </div>

              {/* Remember me */}
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(changeEvent) => setRememberMe(changeEvent.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded accent-ink"
                />
                <span className="text-sm text-charcoal-2">로그인 상태 유지</span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={login.isPending}
                className="btn btn-primary btn-big mt-2 w-full disabled:opacity-50"
              >
                {login.isPending ? '로그인 중…' : '두잉 시작하기 →'}
              </button>
            </form>

            {/* Footer links */}
            <div className="mt-6 space-y-2 text-center text-sm text-charcoal-2">
              <p>
                학생자치회 운영자이신가요?{' '}
                <Link
                  href="/manage"
                  className="font-medium text-charcoal transition-colors hover:text-ink"
                >
                  콘솔 로그인 →
                </Link>
              </p>
              <p>
                아직 두잉이 처음이세요?{' '}
                <Link
                  href="/signup"
                  className="font-medium text-charcoal underline underline-offset-2 transition-colors hover:text-ink"
                >
                  회원가입
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
