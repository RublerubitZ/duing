import {
  Building2,
  CalendarRange,
  CircleAlert,
  ClipboardList,
  FileSearch,
  Globe,
  GraduationCap,
  HelpCircle,
  Landmark,
  LayoutDashboard,
  Megaphone,
  MessageSquareText,
  Newspaper,
  Repeat2,
  Users,
  UserCog,
  type LucideIcon,
} from 'lucide-react';

import type { AdminPendingCounts } from '@duing/types';

/**
 * 사이드바(모바일은 드로어)가 읽는 영역 정의.
 *
 * 사이드바는 여기에서 계층(부모 → 자식)을 파생시킨다. 배열 자체는 평면으로 두고,
 * 자식은 `parent` 로 소속만 표시한다. URL 은 계층과 무관하게 그대로 유지된다.
 */
export type AdminSection = {
  href: `/${string}`;
  title: string;
  group: AdminSectionGroup;
  icon: LucideIcon;
  /** 소속 부모 항목. 지정하면 사이드바에서 해당 부모 아래로 접힌다(부모 자체는 링크가 아니다). */
  parent?: AdminNavParentKey;
  /** 사이드바 뱃지에 표시할 미처리 건수 필드. 없으면 뱃지를 달지 않는다. */
  pendingCountKey?: AdminPendingCountKey;
  /** 방치되면 사용자 피해로 이어지는 항목 — 뱃지를 주의 색으로 표시한다. */
  danger?: boolean;
};

export type AdminSectionGroup = '동아리' | '커뮤니티 운영';

export type AdminNavParentKey = 'promotions';

/** totalPendingCount 는 개별 메뉴에 붙지 않으므로 뱃지 키에서 제외한다. */
export type AdminPendingCountKey = Exclude<keyof AdminPendingCounts, 'totalPendingCount'>;

export type AdminNavParent = {
  key: AdminNavParentKey;
  title: string;
  group: AdminSectionGroup;
  icon: LucideIcon;
};

/**
 * 도메인 그룹 어디에도 속하지 않아 사이드바 맨 위에 단독으로 놓는 메뉴 — 사이드바·모바일 제목·활성 판정이 이 배열 하나를 읽는다.
 * ADMIN_SECTIONS 에는 넣지 않는다. 대시보드는 정확히 /admin 일 때만, 나머지는 하위 경로까지 활성이다.
 */
export type AdminStandaloneSection = {
  href: `/${string}`;
  title: string;
  icon: LucideIcon;
  /** true 면 href 의 하위 경로에서도 활성이다. */
  matchesSubpaths: boolean;
};

export const ADMIN_STANDALONE_SECTIONS: readonly AdminStandaloneSection[] = [
  { href: '/admin', title: '대시보드', icon: LayoutDashboard, matchesSubpaths: false },
  {
    href: '/admin/weekly-briefing',
    title: '주간 브리핑',
    icon: CalendarRange,
    matchesSubpaths: true,
  },
];

export function isStandaloneSectionActive(
  section: AdminStandaloneSection,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  return (
    pathname === section.href ||
    (section.matchesSubpaths && pathname.startsWith(`${section.href}/`))
  );
}

export const ADMIN_NAV_PARENTS: AdminNavParent[] = [
  { key: 'promotions', title: '홍보 관리', group: '커뮤니티 운영', icon: Megaphone },
];

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: '/admin/clubs',
    title: '동아리 관리',
    group: '동아리',
    icon: Users,
    pendingCountKey: 'clubApproval',
  },
  {
    href: '/admin/facility-bookings',
    title: '시설 예약 관리',
    group: '동아리',
    icon: Building2,
    pendingCountKey: 'facilityBooking',
  },
  {
    // 아이콘은 Megaphone 을 피한다 — 사이드바에서 '홍보 관리' 부모가 이미 쓰고 있어 두 메뉴가 겹쳐 읽힌다.
    href: '/admin/recruitments',
    title: '모집 관리',
    group: '동아리',
    icon: ClipboardList,
    pendingCountKey: 'stalePendingRecruitment',
  },
  {
    href: '/admin/fees',
    title: '회비 감사',
    group: '동아리',
    icon: FileSearch,
  },
  {
    href: '/admin/leader-succession',
    title: '회장 승계',
    group: '동아리',
    icon: Repeat2,
    pendingCountKey: 'leaderSuccession',
  },
  {
    href: '/admin/bank-matching',
    title: 'BANK 자동매칭',
    group: '동아리',
    icon: Landmark,
  },
  {
    href: '/admin/notices',
    title: '공지 관리',
    group: '커뮤니티 운영',
    icon: Newspaper,
  },
  {
    href: '/admin/faqs',
    title: 'FAQ 관리',
    group: '커뮤니티 운영',
    icon: HelpCircle,
  },
  {
    href: '/admin/inquiries',
    title: '1:1 문의',
    group: '커뮤니티 운영',
    icon: MessageSquareText,
    pendingCountKey: 'inquiryUnanswered',
  },
  {
    href: '/admin/global-events',
    title: '글로벌 이벤트',
    group: '커뮤니티 운영',
    icon: Globe,
  },
  {
    href: '/admin/reports',
    title: '신고 관리',
    group: '커뮤니티 운영',
    icon: CircleAlert,
    pendingCountKey: 'reportUnresolved',
    danger: true,
  },
  {
    href: '/admin/users',
    title: '회원 관리',
    group: '커뮤니티 운영',
    icon: UserCog,
  },
  {
    // 아이콘은 학년을 뜻하는 GraduationCap — UserCog(회원 관리)·Users(동아리 관리)와 작은 크기에서 겹쳐 읽히지 않게.
    href: '/admin/profile-check',
    title: '정보 확인 팝업',
    group: '커뮤니티 운영',
    icon: GraduationCap,
  },
  {
    href: '/admin/promotion-requests',
    title: '홍보 요청',
    group: '커뮤니티 운영',
    icon: Megaphone,
    parent: 'promotions',
    pendingCountKey: 'promotionRequest',
  },
  {
    href: '/admin/promotions',
    title: '홍보 배너',
    group: '커뮤니티 운영',
    icon: Megaphone,
    parent: 'promotions',
  },
];

export const ADMIN_SECTION_GROUP_ORDER: AdminSectionGroup[] = ['동아리', '커뮤니티 운영'];
