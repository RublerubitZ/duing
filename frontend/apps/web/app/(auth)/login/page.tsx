import { fetchClubStats } from '@/app/_lib/club-stats';
import { LoginFormPanel } from './_components/LoginFormPanel';

<<<<<<< HEAD
export default async function LoginPage() {
  const { totalCount, recruitingCount } = await fetchClubStats();

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
            {totalCount}개 동아리 · {recruitingCount}곳 이번 학기 모집 중.
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

      {/* ─── Right form panel (Client Component) ─── */}
      <LoginFormPanel />
    </div>
  );
}
=======
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useLoginMutation } from '@duing/hooks';
import { loginSchema } from '@duing/schemas';
import { toRoute } from '../../_lib/route';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNext = searchParams.get('next') ?? '/me';
  // 내부 절대 경로만 허용 (//evil.com 같은 protocol-relative 차단).
  const next = /^\/(?!\/)/.test(rawNext)
    ? toRoute(`/${rawNext.slice(1)}`)
    : toRoute('/me');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useLoginMutation();

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
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">로그인</h1>
      {error && (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </div>
      )}
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input
          required
          type="email"
          autoComplete="username"
          autoFocus
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="hong@daegu.ac.kr"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <div className="relative">
          <input
            required
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 pr-14"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
            className="absolute inset-y-0 right-2 my-auto h-7 px-2 text-xs text-slate-500 hover:text-slate-700"
          >
            {showPassword ? '숨김' : '표시'}
          </button>
        </div>
      </label>
      <button
        type="submit"
        disabled={login.isPending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50"
      >
        {login.isPending ? '로그인 중…' : '로그인'}
      </button>
      <p className="text-center text-sm text-slate-500">
        아직 회원이 아니신가요?{' '}
        <Link href="/signup" className="text-slate-900 underline">
          회원가입
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
>>>>>>> origin/main
