import Link from 'next/link';

/**
 * 404 화면 — Next 기본 not-found 는 자기 요소에 system-ui 를 인라인 style 로 박아
 * body 폰트가 닿지 않는다(= head 의 Pretendard preload 가 소비되지 않아 콘솔 경고).
 * `.duing` 브랜드 스코프가 라우트 layout 안에 있어 이 화면에는 닿지 않으므로 여기서 직접 두른다
 * (ManageGuard 와 동일한 이유). 구성은 `/403` 과 같은 main + h1.
 */
export default function NotFoundPage() {
  return (
    <main className="duing bg-cream grid min-h-dvh place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-charcoal-3 text-sm font-semibold">404 Not Found</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">페이지를 찾을 수 없어요.</h1>
        <p className="text-charcoal-2 mt-3 text-sm">
          주소가 바뀌었거나 삭제된 페이지일 수 있습니다.
        </p>
        <Link href="/" className="btn btn-primary mt-6 inline-flex rounded-full px-5">
          홈으로 돌아가기
        </Link>
      </div>
    </main>
  );
}
