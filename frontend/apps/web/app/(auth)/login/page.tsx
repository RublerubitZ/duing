'use client';

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
  // toRoute 는 `/${string}` 을 받으므로, 검증된 경우에만 next 에 할당하고 fallback 을 literal 로 제공한다.
  const next = /^\/(?!\/)/.test(rawNext)
    ? toRoute(`/${rawNext.slice(1)}`)
    : toRoute('/me');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">로그인</h1>
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input type="email" required autoFocus value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="hong@daegu.ac.kr" />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <input type="password" required value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={login.isPending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
        {login.isPending ? '로그인 중…' : '로그인'}
      </button>
      <p className="text-center text-sm text-slate-500">
        계정이 없으신가요?{' '}
        <Link href="/signup" className="text-slate-900 underline">회원가입</Link>
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