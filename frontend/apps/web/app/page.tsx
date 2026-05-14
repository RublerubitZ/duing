import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Du-ing 두잉</h1>
      <p className="mt-4 text-lg text-slate-600">
        대구대학교 동아리 통합 플랫폼. 동아리를 탐색하고, 모집 일정을 확인하고, 한 번에 지원하세요.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          href="/clubs"
          className="rounded-lg border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
        >
          <h2 className="text-xl font-semibold">동아리 탐색</h2>
          <p className="mt-2 text-sm text-slate-600">카테고리/분류/키워드로 동아리 찾기</p>
        </Link>
        <Link
          href="/recruitments"
          className="rounded-lg border border-slate-200 p-6 transition hover:border-slate-400 hover:shadow-sm"
        >
          <h2 className="text-xl font-semibold">모집 달력</h2>
          <p className="mt-2 text-sm text-slate-600">이번 달 모집 일정 한눈에 보기</p>
        </Link>
      </div>

      <p className="mt-12 text-xs text-slate-400">
        백엔드 API: {process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8080/api/v1'}
      </p>
    </main>
  );
}
