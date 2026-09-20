import type { Route } from 'next';
import Link from 'next/link';

type Props = {
  title: string;
  description: string;
  actionHref: Route;
  actionLabel: string;
};

/**
 * 리소스(동아리·소식·모집) 단위 "볼 수 없음" 화면 — 레이아웃(GNB·탭바) 안에서 렌더된다.
 * 전역 404(app/not-found.tsx)와 같은 시각 언어. 존재하지 않음·권한 없음을 구분하지 않는다(열거 방지).
 */
export function ResourceNotFound({ title, description, actionHref, actionLabel }: Props) {
  return (
    <div className="mx-auto max-w-layout px-4 py-24 text-center sm:px-6 md:px-10">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      <p className="text-charcoal-2 mt-3 text-sm">{description}</p>
      <Link href={actionHref} className="btn btn-primary mt-6 inline-flex rounded-full px-5">
        {actionLabel}
      </Link>
    </div>
  );
}
