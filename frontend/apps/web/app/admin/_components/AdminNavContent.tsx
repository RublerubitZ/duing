'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toRoute } from '../../_lib/route';
import {
  ADMIN_SECTIONS,
  ADMIN_SECTION_GROUP_ORDER,
  type AdminSection,
} from '../_lib/adminSections';

/**
 * 어드민 섹션 내비 본문 — 데스크탑 사이드바(AdminSidebar)와 모바일 드로어(AdminMobileBar)가 공유한다.
 * 바깥 컨테이너(aside / SheetContent)가 배경·스크롤·패딩을 제공한다.
 *
 * 활성 판정 규칙: 현재 경로가 정확히 일치하거나, 섹션 href 의 하위 경로일 때 활성.
 * 예: `/admin/notices/new` 는 `/admin/notices` 와 활성을 공유.
 */
export function AdminNavContent() {
  const pathname = usePathname();
  const activeHref = resolveActiveSectionHref(pathname);

  return (
    <>
      <Link
        href={toRoute('/admin')}
        className="mb-4 block px-5 text-xs font-semibold uppercase tracking-wider text-charcoal-3 hover:text-ink"
      >
        총동연 관리자
      </Link>
      <ul className="space-y-6">
        {ADMIN_SECTION_GROUP_ORDER.map((group) => (
          <li key={group}>
            <h3 className="px-5 mb-1 text-xs font-semibold text-charcoal-3">{group}</h3>
            <ul>
              {ADMIN_SECTIONS.filter((section) => section.group === group).map((section) => (
                <li key={section.href}>
                  <SidebarLink section={section} active={section.href === activeHref} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

function SidebarLink({ section, active }: { section: AdminSection; active: boolean }) {
  const base = 'block px-5 py-2 text-sm transition border-l-2';
  const stateClass = active
    ? 'border-coral text-ink font-semibold bg-coral/5'
    : 'border-transparent text-charcoal-3 hover:text-ink hover:border-charcoal-1';
  return (
    <Link
      href={toRoute(section.href)}
      className={`${base} ${stateClass}`}
      aria-current={active ? 'page' : undefined}
    >
      {section.title}
    </Link>
  );
}

/**
 * 가장 긴 prefix 가 일치하는 섹션을 활성으로 선택해, 한 섹션 href 가
 * 다른 섹션 href 의 하위 경로여도 더 구체적인 쪽이 활성이 되도록 한다.
 */
export function resolveActiveSectionHref(pathname: string | null): string | null {
  if (!pathname) return null;
  let best: { href: string; length: number } | null = null;
  for (const section of ADMIN_SECTIONS) {
    if (pathname === section.href || pathname.startsWith(`${section.href}/`)) {
      if (!best || section.href.length > best.length) {
        best = { href: section.href, length: section.href.length };
      }
    }
  }
  return best?.href ?? null;
}
