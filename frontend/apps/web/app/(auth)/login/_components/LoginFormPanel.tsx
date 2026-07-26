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
import { ButtonSpinner } from '@/components/loading/Spinner';
import posthog from 'posthog-js';

const CREDENTIAL_ERROR_MESSAGE = '학번 또는 비밀번호가 올바르지 않습니다.';
const SERVER_ERROR_MESSAGE = '일시적인 오류가 발생했어요. 잠시 후 다시 시도해주세요.';

/**
 * 로그인 실패를 사용자 문구로 옮긴다.
 *
 * 서버 문구를 쓸 수 없는 경우만 좁게 나열하고, 나머지는 서버가 준 사유를 그대로 보여준다.
 * 반대로(알려진 몇 가지만 서버 문구를 쓰고 나머지는 자격증명 실패로 단정) 짜면 백엔드가 로그인
 * 실패 사유를 늘릴 때마다 조용히 오안내가 된다 — 타임아웃과 계정 정지에서 이미 두 번 그렇게 샜다.
 */
function loginErrorMessage(loginError: unknown): string {
  // ApiError 가 아니면 서버가 준 문구 자체가 없다.
  if (!(loginError instanceof ApiError)) return CREDENTIAL_ERROR_MESSAGE;
  // 타임아웃·오프라인은 이미 사용자 문구로 정규화돼 있다 — 비밀번호를 의심하게 두지 않는다.
  if (loginError.code === 'TIMEOUT' || loginError.code === 'NETWORK') return loginError.message;
  // 5xx 본문은 사용자 대면 문구가 아니다. 전역 폴백(global-error.tsx)과 같은 결로 안내한다.
  if (loginError.status >= 500) return SERVER_ERROR_MESSAGE;
  // 400 은 필드명이 섞인 검증 문구라 그대로 노출하지 않는다. 자격증명 문구는 프론트가 소유해
  // 서버 표현이 바뀌어도 로그인 화면의 가장 흔한 안내가 흔들리지 않게 한다.
  if (loginError.status === 400 || loginError.status === 401) return CREDENTIAL_ERROR_MESSAGE;
  // 나머지 4xx(403 이용 정지, 429 계정 잠금·과요청)는 서버가 사유별 한국어 안내를 준다.
  return loginError.message || CREDENTIAL_ERROR_MESSAGE;
}

function IconStudentId() {
  // 학번 입력 — 학생증(사진 + 텍스트 줄) 아이콘으로 신분/학번 맥락을 드러낸다.
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5.5" cy="7" r="1.3" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.2 10.6c0-1.1 1-1.7 2.3-1.7s2.3.6 2.3 1.7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M9.5 6.6h3.2M9.5 9.4h3.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
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
      const loggedInUser = await login.mutateAsync({ ...parsed.data, rememberMe });
      posthog.identify(String(loggedInUser.id));
      posthog.capture('user_logged_in', { remember_me: rememberMe });
      router.replace(next);
    } catch (loginError) {
      setError(loginErrorMessage(loginError));
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
                  <IconStudentId />
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
                  placeholder="8자리 숫자"
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
              {login.isPending && <ButtonSpinner />}두잉 시작하기 →
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
