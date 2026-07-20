'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

import { useAdminPendingCountsQuery } from '@duing/hooks';
import type { AdminPendingCounts } from '@duing/types';

import { cn } from '@/app/_lib/cn';
import { toRoute } from '../../_lib/route';
import {
  ADMIN_DASHBOARD,
  ADMIN_NAV_PARENTS,
  ADMIN_SECTIONS,
  ADMIN_SECTION_GROUP_ORDER,
  type AdminNavParentKey,
  type AdminSection,
} from '../_lib/adminSections';

/**
 * 어드민 섹션 내비 본문 — 데스크탑 사이드바(AdminSidebar)와 모바일 드로어(AdminMobileBar)가 공유한다.
 * 바깥 컨테이너(aside / SheetContent)가 배경·스크롤·패딩을 제공한다.
 *
 * 활성 판정 규칙: 현재 경로가 정확히 일치하거나, 섹션 href 의 하위 경로일 때 활성.
 * 예: `/admin/notices/new` 는 `/admin/notices` 와 활성을 공유.
 *
 * 접힘(collapsed)은 데스크탑 사이드바만 넘긴다 — 드로어는 폭이 충분해 항상 펼친 상태다.
 */
export function AdminNavContent({
  collapsed = false,
  onRequestExpand,
}: {
  collapsed?: boolean;
  /** 접힌 폭에서는 하위 메뉴를 펼칠 자리가 없다 — 부모를 누르면 사이드바 자체를 먼저 펼친다. */
  onRequestExpand?: () => void;
}) {
  const pathname = usePathname();
  const activeHref = resolveActiveSectionHref(pathname);
  const pendingCountsQuery = useAdminPendingCountsQuery();
  const pendingCounts = pendingCountsQuery.data;

  // 자식이 활성인 부모는 펼친 채로 시작한다. 사용자가 직접 접은 상태는 경로가 바뀌어도 보존한다.
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});
  const activeParentKey = ADMIN_SECTIONS.find((section) => section.href === activeHref)?.parent;

  useEffect(() => {
    if (!activeParentKey) return;
    setOpenParents((current) => ({ ...current, [activeParentKey]: true }));
  }, [activeParentKey]);

  return (
    <div className="flex flex-col gap-1">
      <NavRow
        href={ADMIN_DASHBOARD.href}
        title={ADMIN_DASHBOARD.title}
        Icon={ADMIN_DASHBOARD.icon}
        active={pathname === ADMIN_DASHBOARD.href}
        collapsed={collapsed}
      />

      {ADMIN_SECTION_GROUP_ORDER.map((group, groupIndex) => {
        const parents = ADMIN_NAV_PARENTS.filter((parent) => parent.group === group);
        const topLevelSections = ADMIN_SECTIONS.filter(
          (section) => section.group === group && !section.parent,
        );
        return (
          <div key={group} className="mt-2 flex flex-col gap-0.5">
            {collapsed ? (
              // 접힌 폭에는 그룹 라벨이 들어가지 않아 구분선으로 대체한다(첫 그룹 위는 비운다).
              groupIndex > 0 && <div aria-hidden className="mx-2 my-2 h-px bg-line" />
            ) : (
              <div className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wide08 text-charcoal-3">
                {group}
              </div>
            )}

            {topLevelSections.map((section) => (
              <NavRow
                key={section.href}
                href={section.href}
                title={section.title}
                Icon={section.icon}
                active={section.href === activeHref}
                collapsed={collapsed}
                badge={badgeOf(section, pendingCounts)}
                danger={section.danger}
              />
            ))}

            {parents.map((parent) => {
              const children = ADMIN_SECTIONS.filter((section) => section.parent === parent.key);
              const childActive = children.some((section) => section.href === activeHref);
              const expanded = openParents[parent.key] ?? false;
              const childBadgeTotal = children.reduce(
                (total, section) => total + (badgeOf(section, pendingCounts) ?? 0),
                0,
              );
              return (
                <ParentRow
                  key={parent.key}
                  parentKey={parent.key}
                  title={parent.title}
                  Icon={parent.icon}
                  collapsed={collapsed}
                  expanded={expanded}
                  childActive={childActive}
                  // 접혀 있으면 안쪽 뱃지가 보이지 않으므로 부모가 합계를 대신 짊어진다.
                  badge={!expanded || collapsed ? childBadgeTotal || undefined : undefined}
                  onToggle={() => {
                    if (collapsed) {
                      // 접힌 상태에서는 토글이 아니라 "펼치고 열기" 다. 그러지 않으면 눌러도 아무 일이
                      // 일어나지 않아 자식 메뉴에 사이드바로는 도달할 수 없다.
                      onRequestExpand?.();
                      setOpenParents((current) => ({ ...current, [parent.key]: true }));
                      return;
                    }
                    setOpenParents((current) => ({ ...current, [parent.key]: !expanded }));
                  }}
                >
                  {children.map((section) => (
                    <ChildRow
                      key={section.href}
                      href={section.href}
                      title={section.title}
                      active={section.href === activeHref}
                      badge={badgeOf(section, pendingCounts)}
                    />
                  ))}
                </ParentRow>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function badgeOf(section: AdminSection, counts: AdminPendingCounts | undefined) {
  if (!section.pendingCountKey || !counts) return undefined;
  const count = counts[section.pendingCountKey];
  return count > 0 ? count : undefined;
}

/** 활성 표시는 sage 필 + 좌측 ink 바 두 겹이다 — 색 하나에만 기대지 않아 대비가 낮은 환경에서도 읽힌다. */
const rowBase =
  'group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-[13.5px] outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-paper-warm ' +
  'motion-safe:transition-colors';
const rowActive = 'bg-sage-mist font-bold text-ink-deep';
const rowIdle = 'font-semibold text-charcoal-2 hover:bg-sage-tint hover:text-ink-deep';

function ActiveBar() {
  return (
    <span
      aria-hidden
      className="absolute -left-2 top-1/2 h-6 w-[4px] -translate-y-1/2 rounded-full bg-ink"
    />
  );
}

function NavRow({
  href,
  title,
  Icon,
  active,
  collapsed,
  badge,
  danger,
}: {
  href: `/${string}`;
  title: string;
  Icon: AdminSection['icon'];
  active: boolean;
  collapsed: boolean;
  badge?: number;
  danger?: boolean;
}) {
  return (
    <Link
      href={toRoute(href)}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? title : undefined}
      className={cn(rowBase, collapsed && 'justify-center px-0', active ? rowActive : rowIdle)}
    >
      {active && <ActiveBar />}
      <Icon size={19} strokeWidth={active ? 2.2 : 1.8} className="shrink-0" />
      {collapsed ? (
        badge === undefined ? (
          <span className="sr-only">{title}</span>
        ) : (
          <CollapsedBadgeDot danger={danger} count={badge} title={title} />
        )
      ) : (
        <>
          <span className="flex-1 truncate">{title}</span>
          {badge !== undefined && <NavBadge danger={danger}>{badge}</NavBadge>}
        </>
      )}
    </Link>
  );
}

function ParentRow({
  parentKey,
  title,
  Icon,
  collapsed,
  expanded,
  childActive,
  badge,
  onToggle,
  children,
}: {
  parentKey: AdminNavParentKey;
  title: string;
  Icon: AdminSection['icon'];
  collapsed: boolean;
  expanded: boolean;
  childActive: boolean;
  badge?: number;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = `admin-nav-${parentKey}`;
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        // 접힘 상태에는 패널 자체가 렌더되지 않으므로 그것을 가리키는 ARIA 도 달지 않는다.
        aria-expanded={collapsed ? undefined : expanded}
        aria-controls={collapsed ? undefined : panelId}
        title={collapsed ? title : undefined}
        className={cn(
          rowBase,
          'w-full text-left',
          collapsed && 'justify-center px-0',
          childActive ? rowActive : rowIdle,
        )}
      >
        {childActive && <ActiveBar />}
        <Icon size={19} strokeWidth={childActive ? 2.2 : 1.8} className="shrink-0" />
        {collapsed ? (
          badge === undefined ? (
            <span className="sr-only">{title}</span>
          ) : (
            <CollapsedBadgeDot count={badge} title={title} />
          )
        ) : (
          <>
            <span className="flex-1 truncate">{title}</span>
            {badge !== undefined && <NavBadge>{badge}</NavBadge>}
            <ChevronDown
              size={15}
              aria-hidden
              className={cn(
                'shrink-0 text-charcoal-3 motion-safe:transition-transform',
                expanded && 'rotate-180',
              )}
            />
          </>
        )}
      </button>

      {/* 접힘 애니메이션은 grid-template-rows 로 — height auto 는 트랜지션할 수 없다. */}
      {!collapsed && (
        <div
          id={panelId}
          className="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-out"
          style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">
            {/* inert 로 포커스·접근성 트리에서만 뺀다 — display:none(hidden)으로 지우면 접힘 시작
                높이가 0 이 되어 위 grid-template-rows 트랜지션이 죽는다. */}
            <div inert={!expanded} className="flex flex-col gap-0.5 pt-0.5">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ChildRow({
  href,
  title,
  active,
  badge,
}: {
  href: `/${string}`;
  title: string;
  active: boolean;
  badge?: number;
}) {
  return (
    <Link
      href={toRoute(href)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-md py-2 pl-11 pr-3 text-[13px] outline-none',
        'focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-paper-warm',
        'motion-safe:transition-colors',
        active
          ? 'bg-sage-mist font-bold text-ink-deep'
          : 'font-semibold text-charcoal-3 hover:bg-sage-tint hover:text-ink-deep',
      )}
    >
      <span
        aria-hidden
        className={cn('absolute left-6 h-[5px] w-[5px] rounded-full', active ? 'bg-ink' : 'bg-sage')}
      />
      <span className="flex-1 truncate">{title}</span>
      {badge !== undefined && <NavBadge>{badge}</NavBadge>}
    </Link>
  );
}

function NavBadge({ children, danger }: { children: number; danger?: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-1.5 py-px font-mono text-[10px] font-extrabold leading-none',
        danger ? 'bg-coral text-paper' : 'bg-paper text-charcoal-2 ring-1 ring-line',
      )}
    >
      {children}
      <span className="sr-only"> 건 처리 대기</span>
    </span>
  );
}

/** 접힌 폭에는 숫자가 들어가지 않아 점으로 알리고, 건수는 스크린리더에만 전달한다. */
function CollapsedBadgeDot({
  count,
  danger,
  title,
}: {
  count: number;
  danger?: boolean;
  title: string;
}) {
  return (
    <>
      <span
        aria-hidden
        className={cn(
          'absolute right-2.5 top-2 h-[7px] w-[7px] rounded-full ring-2 ring-paper-warm',
          danger ? 'bg-coral' : 'bg-ink',
        )}
      />
      <span className="sr-only">{`${title} ${count}건 처리 대기`}</span>
    </>
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
