'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGuardedRouter } from '@/app/_lib/useGuardedRouter';
import Link from 'next/link';
import { ApiError } from '@duing/api';
import { useLoginMutation } from '@duing/hooks';
import { loginSchema } from '@duing/schemas';
import { cn } from '@/app/_lib/cn';
import { toLinkRoute, toRoute } from '@/app/_lib/route';

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
  const router = useGuardedRouter();
  const searchParams = useSearchParams();
  // next 는 공격자가 조작할 수 있는 값이므로 내부 절대경로만 허용한다 — toLinkRoute 가 프로토콜
  // 상대경로(//host)·역슬래시(/\host)처럼 브라우저가 오프-오리진으로 해석하는 값을 걸러내 open redirect 를 막는다.
  const next = toLinkRoute(searchParams.get('next')) ?? toRoute('/me');

  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useLoginMutation();

  const isStudentIdValid = /^\d{8}$/.test(studentId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = loginSchema.safeParse({ studentId, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? '입력값을 확인해주세요.');
      return;
    }
    try {
      await login.mutateAsync(parsed.data);
      router.replace(next);
    } catch (loginError) {
      // 타임아웃·오프라인은 자격증명 문제가 아니다 — 정규화된 안내(요청 시간 초과/연결 확인)를 그대로 보여줘
      // 사용자가 비밀번호를 의심하지 않게 한다. (재현 실험에서 확인된 오안내 수정)
      if (loginError instanceof ApiError && (loginError.code === 'TIMEOUT' || loginError.code === 'NETWORK')) {
        setError(loginError.message);
      } else if (loginError instanceof ApiError && (loginError.status === 429 || loginError.status >= 500)) {
        // 서버 장애·과요청은 자격증명 문제가 아니다 — 전역 폴백(global-error.tsx)과 같은 결의 안내.
        setError('일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.');
      } else {
        setError('학번 또는 비밀번호가 올바르지 않습니다.');
      }
    }
  }

  return (
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
            학번과 비밀번호로 로그인할 수 있어요.
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
            {/* Student ID field */}
            <div>
              <label htmlFor="login-studentId" className="mb-1.5 block text-sm font-medium text-charcoal">
                학번
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-charcoal-3">
                  <IconMail />
                </span>
                <input
                  id="login-studentId"
                  required
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  pattern="\d{8}"
                  autoComplete="username"
                  autoFocus
                  value={studentId}
                  onChange={(changeEvent) =>
                    setStudentId(changeEvent.target.value.replace(/\D/g, '').slice(0, 8))
                  }
                  placeholder="20241234"
                  className={cn(
                    'w-full rounded-md border bg-paper py-3 pl-10 pr-10 text-sm text-charcoal outline-none transition',
                    'placeholder:text-charcoal-3/50',
                    'border-line focus:border-ink focus:ring-1 focus:ring-ink/20',
                  )}
                />
                {isStudentIdValid && (
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
                <Link
                  href="/forgot-password"
                  className="text-xs text-charcoal-2 underline underline-offset-2 transition-colors hover:text-charcoal"
                >
                  비밀번호를 잊으셨나요?
                </Link>
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
  );
}

export function LoginFormPanel() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
