import Link from 'next/link';

/**
 * 403 화면 — `.duing` 브랜드 스코프가 라우트 layout 안에 있어 이 화면에는 닿지 않으므로
 * 여기서 직접 두른다(ManageGuard·not-found 와 동일한 이유). 없으면 헤딩이 디스플레이 폰트를
 * 못 받아 쌍둥이 화면인 404 와 다르게 보인다.
 */
export default function ForbiddenPage() {
  return (
    <main className="duing bg-cream grid min-h-dvh place-items-center px-6">
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
