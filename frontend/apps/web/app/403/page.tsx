import Link from 'next/link';

export default function ForbiddenPage() {
  return (
    <main className="bg-cream grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-charcoal-3 text-sm font-semibold">403 Forbidden</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">접근 권한이 없어요.</h1>
        <p className="text-charcoal-2 mt-3 text-sm">
          요청한 페이지는 총동연(관리자) 권한이 필요합니다.
        </p>
        <Link
          href="/"
          className="btn btn-primary mt-6 inline-flex rounded-full px-5"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
