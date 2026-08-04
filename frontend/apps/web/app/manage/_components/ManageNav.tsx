'use client';

import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  Image as ImageIcon,
  Info,
  LayoutDashboard,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useRecruitmentDetailQuery } from '@duing/hooks';
import { cn } from '../../_lib/cn';
import { toRoute } from '../../_lib/route';

type ManageNavProps = {
  currentClubId: number;
  /** 데스크탑 사이드바 접힘 상태 — 아이콘만 표시하고 라벨은 sr-only + title 로 옮긴다. */
  collapsed?: boolean;
};

type NavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  /** null 이면 비활성 안내 항목 (지원자/통계 — 모집 미선택·외부 폼). typedRoutes 이므로 Route 타입. */
  href: Route | null;
  active: boolean;
  /** 비활성 사유 문구. href 가 null 일 때만 쓴다. */
  disabledHint?: string;
};

type NavGroup = {
  /** null 이면 라벨 없는 최상단 그룹 (대시보드) */
  label: string | null;
  items: NavItem[];
};

const NO_RECRUITMENT_HINT = '모집을 먼저 선택하세요';
const EXTERNAL_MODE_HINT = '외부 폼 모집은 사용하지 않아요';

export function ManageNav({ currentClubId, collapsed = false }: ManageNavProps) {
  const pathname = usePathname();

  const dashboardPath = toRoute(`/manage/clubs/${currentClubId}`);
  const recruitmentsPath = toRoute(`/manage/clubs/${currentClubId}/recruitments`);
  const photosPath = toRoute(`/manage/clubs/${currentClubId}/photos`);
  const membersPath = toRoute(`/manage/clubs/${currentClubId}/members`);
  const feesPath = toRoute(`/manage/clubs/${currentClubId}/fees`);
  const infoPath = toRoute(`/manage/clubs/${currentClubId}/info`);
  const facilityBookingsPath = toRoute(`/manage/clubs/${currentClubId}/facility-bookings`);

  // 모집 하위 페이지(상세/지원자/통계/면접 등)를 보는 중이면 해당 모집 컨텍스트로
  // 지원자·통계 진입을 활성화한다. 모집을 선택하지 않은 목록·신규 작성 화면에서는 비활성 안내를 유지한다.
  const recruitmentSubPath = pathname.startsWith(`${recruitmentsPath}/`)
    ? pathname.slice(recruitmentsPath.length + 1).split('/')[0]
    : undefined;
  const activeRecruitmentId =
    recruitmentSubPath && /^\d+$/.test(recruitmentSubPath) ? recruitmentSubPath : undefined;

  // 외부 폼 모집은 지원서·통계를 쓰지 않으므로 두 진입점을 비활성 안내로 바꾼다(스펙 §5.1).
  // fail-open — 모드를 아직 모르는 로딩·조회 실패 상태는 링크를 그대로 둔다("알려진 EXTERNAL 만 숨김").
  const { data: activeRecruitment } = useRecruitmentDetailQuery(
    activeRecruitmentId === undefined ? undefined : Number(activeRecruitmentId),
  );
  const isExternalRecruitment = activeRecruitment?.applicationMode === 'EXTERNAL';

  const applicantsPath =
    activeRecruitmentId && !isExternalRecruitment
      ? toRoute(`/manage/clubs/${currentClubId}/recruitments/${activeRecruitmentId}/applicants`)
      : null;
  const statsPath =
    activeRecruitmentId && !isExternalRecruitment
      ? toRoute(`/manage/clubs/${currentClubId}/recruitments/${activeRecruitmentId}/stats`)
      : null;
  const recruitmentActionHint = isExternalRecruitment ? EXTERNAL_MODE_HINT : NO_RECRUITMENT_HINT;

  const isApplicantsActive = applicantsPath !== null && pathname.startsWith(applicantsPath);
  const isStatsActive = statsPath !== null && pathname.startsWith(statsPath);
  // 지원자/통계 하위 페이지에서는 그 항목이 활성이므로 "모집 관리" 중복 강조를 끈다.
  const isRecruitmentsActive =
    pathname.startsWith(recruitmentsPath) && !isApplicantsActive && !isStatsActive;

  const groups: NavGroup[] = [
    {
      label: null,
      items: [
        {
          key: 'dashboard',
          label: '대시보드',
          icon: LayoutDashboard,
          href: dashboardPath,
          active: pathname === dashboardPath,
        },
      ],
    },
    {
      label: '모집',
      items: [
        {
          key: 'recruitments',
          label: '모집 관리',
          icon: ClipboardList,
          href: recruitmentsPath,
          active: isRecruitmentsActive,
        },
        {
          key: 'applicants',
          label: '지원자',
          icon: Users,
          href: applicantsPath,
          active: isApplicantsActive,
          disabledHint: recruitmentActionHint,
        },
        {
          key: 'stats',
          label: '통계',
          icon: BarChart3,
          href: statsPath,
          active: isStatsActive,
          disabledHint: recruitmentActionHint,
        },
      ],
    },
    {
      label: '운영',
      items: [
        {
          key: 'members',
          label: '멤버 관리',
          icon: UsersRound,
          href: membersPath,
          active: pathname.startsWith(membersPath),
        },
        { key: 'fees', label: '회비 관리', icon: Wallet, href: feesPath, active: pathname.startsWith(feesPath) },
        {
          key: 'facility-bookings',
          label: '시설 예약',
          icon: CalendarCheck,
          href: facilityBookingsPath,
          active: pathname.startsWith(facilityBookingsPath),
        },
        { key: 'photos', label: '활동 피드', icon: ImageIcon, href: photosPath, active: pathname.startsWith(photosPath) },
      ],
    },
    {
      label: '설정',
      items: [
        { key: 'info', label: '동아리 정보', icon: Info, href: infoPath, active: pathname.startsWith(infoPath) },
      ],
    },
  ];

  return (
    <nav
      aria-label="운영 메뉴"
      className={cn('min-h-0 flex-1 overflow-y-auto pb-2', collapsed ? 'px-3.5' : 'px-4')}
    >
      {groups.map((group, groupIndex) => (
        <div key={group.label ?? 'top'} className="mb-1.5">
          {group.label &&
            (collapsed ? (
              groupIndex > 0 && <div aria-hidden className="h-2" />
            ) : (
              <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-white/35">
                {group.label}
              </p>
            ))}
          {group.items.map((item) => (
            <ManageNavItem key={item.key} item={item} collapsed={collapsed} />
          ))}
        </div>
      ))}
    </nav>
  );
}

function ManageNavItem({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;

  if (item.href === null) {
    // 지원자/통계 — 모집 컨텍스트가 없거나 외부 폼 모집일 때의 비활성 안내
    const hint = item.disabledHint ?? NO_RECRUITMENT_HINT;
    if (collapsed) {
      return (
        <span
          title={`${item.label} — ${hint}`}
          className="my-0.5 flex cursor-not-allowed select-none justify-center rounded-md py-2.5 text-white/25"
        >
          <Icon size={19} aria-hidden className="shrink-0" />
          <span className="sr-only">{`${item.label} — ${hint}`}</span>
        </span>
      );
    }
    return (
      <span className="my-0.5 block cursor-not-allowed select-none rounded-md px-3 py-2.5 text-[13.5px] text-white/35">
        <span className="flex items-center gap-3">
          <Icon size={19} aria-hidden className="shrink-0 text-white/25" />
          {item.label}
        </span>
        <span className="mt-0.5 block pl-8 text-[11px] leading-tight text-white/30">{hint}</span>
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={item.active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'relative my-0.5 flex items-center gap-3 rounded-md py-2.5 text-[13.5px] font-semibold outline-none',
        'focus-visible:ring-2 focus-visible:ring-sage motion-safe:transition-colors motion-safe:duration-200',
        collapsed ? 'justify-center px-0' : 'px-3',
        item.active ? 'bg-white/10 font-bold text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
      )}
    >
      {item.active && (
        <span
          aria-hidden
          className={cn(
            'absolute top-1/2 h-[26px] w-[5px] -translate-y-1/2 rounded-full bg-sage',
            collapsed ? '-left-3.5' : '-left-4',
          )}
        />
      )}
      <Icon size={19} aria-hidden className={cn('shrink-0', item.active && 'text-sage')} />
      {collapsed ? (
        <span className="sr-only">{item.label}</span>
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
      )}
    </Link>
  );
}
