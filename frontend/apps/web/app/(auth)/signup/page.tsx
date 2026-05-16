'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSignupMutation } from '@duing/hooks';
import { signupSchema } from '@duing/schemas';

export default function SignupPage() {
  const router = useRouter();
  const signup = useSignupMutation();
  const [form, setForm] = useState({ studentId: '', name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = signupSchema.safeParse(form);
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

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <h1 className="text-2xl font-semibold">회원가입</h1>
      <label className="block">
        <span className="text-sm text-slate-600">학번</span>
        <input required pattern="\d{7,10}" value={form.studentId}
          onChange={(e) => update('studentId', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="7~10자리 숫자" />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">이름</span>
        <input required maxLength={50} value={form.name}
          onChange={(e) => update('name', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">학교 이메일</span>
        <input required type="email" value={form.email}
          onChange={(e) => update('email', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="hong@daegu.ac.kr" />
        <span className="mt-1 block text-xs text-slate-500">
          대구대학교(@daegu.ac.kr) 이메일만 사용 가능합니다.
        </span>
      </label>
      <label className="block">
        <span className="text-sm text-slate-600">비밀번호</span>
        <input required type="password" minLength={8} maxLength={72} value={form.password}
          onChange={(e) => update('password', e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          placeholder="8~72자" />
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button type="submit" disabled={signup.isPending}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-white disabled:opacity-50">
        {signup.isPending ? '가입 중…' : '회원가입'}
      </button>
      <p className="text-center text-sm text-slate-500">
        이미 계정이 있으신가요?{' '}
        <Link href="/login" className="text-slate-900 underline">로그인</Link>
      </p>
    </form>
  );
}