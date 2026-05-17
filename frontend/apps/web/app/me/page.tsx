'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLogout, useMeQuery } from '@duing/hooks';

export default function MyPage() {
  const meQuery = useMeQuery();
  const logout = useLogout();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace('/');
  }

  const user = meQuery.data;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-bold">마이페이지</h1>

      <section className="mt-6 rounded-xl border border-slate-200 p-6">
        {meQuery.isLoading && <p className="text-sm text-slate-500">불러오는 중…</p>}
        {meQuery.error && (
          <p className="text-sm text-rose-600">
            사용자 정보를 불러오지 못했습니다.{' '}
            {meQuery.error instanceof Error ? meQuery.error.message : ''}
          </p>
        )}
        {user && (
          <dl className="grid grid-cols-[100px_1fr] gap-y-2 text-sm">
            <dt className="text-slate-500">이름</dt>
            <dd className="font-medium">{user.name}</dd>
            <dt className="text-slate-500">학번</dt>
            <dd className="font-medium">{user.studentId}</dd>
            <dt className="text-slate-500">이메일</dt>
            <dd className="font-medium">{user.email}</dd>
            <dt className="text-slate-500">역할</dt>
            <dd className="font-medium">{user.role === 'ADMIN' ? '관리자' : '학생'}</dd>
          </dl>
        )}
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        <Link
          href="/me/applications"
          className="rounded-xl border border-slate-200 p-5 transition hover:border-slate-400"
        >
          <div className="text-sm text-slate-500">내 활동</div>
          <div className="mt-1 text-base font-semibold">내 지원 목록</div>
        </Link>
        <Link
          href="/manage"
          className="rounded-xl border border-slate-200 p-5 transition hover:border-slate-400"
        >
          <div className="text-sm text-slate-500">운영자</div>
          <div className="mt-1 text-base font-semibold">동아리 관리</div>
        </Link>
      </section>

      <section className="mt-10 flex justify-end">
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700"
        >
          로그아웃
        </button>
      </section>
    </main>
  );
}
