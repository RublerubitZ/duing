import Link from 'next/link';
import { toRoute } from '../_lib/route';
import { ADMIN_SECTIONS } from './_lib/adminSections';

export default function AdminIndexPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-ink">총동연 관리자</h1>
        <p className="mt-2 text-sm text-charcoal-3">
          어드민 권한이 부여된 영역을 한눈에 확인하고 진입할 수 있습니다.
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ADMIN_SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={toRoute(section.href)}
              className="block rounded-2xl border border-charcoal-1 bg-white p-5 transition hover:border-coral hover:shadow-sm"
            >
              <h2 className="text-base font-semibold text-ink">{section.title}</h2>
              <p className="mt-2 text-sm text-charcoal-3">{section.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
