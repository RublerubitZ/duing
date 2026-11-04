import Link from 'next/link';
import { toRoute } from '../_lib/route';
import { AdminSectionPendingBadge } from './_components/AdminSectionPendingBadge';
import { AdminHomeDashboard } from './_components/home/AdminHomeDashboard';
import { AdminHomeHeadline } from './_components/home/AdminHomeHeadline';
import { ADMIN_SECTIONS } from './_lib/adminSections';

export default function AdminIndexPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">총동연 관리자</h1>
        <AdminHomeHeadline />
      </header>
      <AdminHomeDashboard />
      <section aria-labelledby="admin-menu-heading" className="mt-10">
        <h2 id="admin-menu-heading" className="mb-4 text-base font-semibold text-ink">
          전체 메뉴
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={toRoute(section.href)}
                className="block rounded-2xl border border-charcoal-1 bg-white p-5 transition hover:border-coral hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-ink">{section.title}</h3>
                  {section.pendingCountKey && (
                    <AdminSectionPendingBadge pendingCountKey={section.pendingCountKey} />
                  )}
                </div>
                <p className="mt-2 text-sm text-charcoal-3">{section.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
