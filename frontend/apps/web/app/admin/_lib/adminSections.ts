import {
  Building2,
  CircleAlert,
  ClipboardList,
  FileSearch,
  Globe,
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
 * 어드민 홈 카드와 사이드바가 공유하는 영역 정의.
 * 한 곳에서만 수정하면 두 진입 지점이 동시에 갱신된다.
 *
 * 사이드바는 여기에서 계층(부모 → 자식)을 파생시킨다. 배열 자체는 평면으로 두는데, 어드민 홈이
 * 전체 영역을 카드로 나열하려면 평면 목록이 필요하고 구조를 두 벌 유지하면 반드시 어긋나기 때문이다.
 * 자식은 `parent` 로 소속만 표시하고, URL 은 계층과 무관하게 그대로 유지된다.
 */
export type AdminSection = {
  href: `/${string}`;
  title: string;
  description: string;
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

/** 대시보드는 도메인 그룹 어디에도 속하지 않아 사이드바 최상단에 단독으로 놓는다. */
export const ADMIN_DASHBOARD = {
  href: '/admin',
  title: '대시보드',
  icon: LayoutDashboard,
} as const;

export const ADMIN_NAV_PARENTS: AdminNavParent[] = [
  { key: 'promotions', title: '홍보 관리', group: '커뮤니티 운영', icon: Megaphone },
];

export const ADMIN_SECTIONS: AdminSection[] = [
  {
    href: '/admin/clubs',
    title: '동아리 관리',
    description: '동아리 승인·반려, 중앙동아리 지정, 신규 등록',
    group: '동아리',
    icon: Users,
    pendingCountKey: 'clubApproval',
  },
  {
    href: '/admin/facility-bookings',
    title: '시설 예약 관리',
    description: '대관 예약 검토·학교 제출 준비·제출 이력·크롤 예약 현황',
    group: '동아리',
    icon: Building2,
    pendingCountKey: 'facilityBooking',
  },
  {
    // 아이콘은 Megaphone 을 피한다 — 사이드바에서 '홍보 관리' 부모가 이미 쓰고 있어 두 메뉴가 겹쳐 읽힌다.
    href: '/admin/recruitments',
    title: '모집 관리',
    description: '전 동아리 모집 현황·강제 마감·지원자 열람',
    group: '동아리',
    icon: ClipboardList,
  },
  {
    href: '/admin/fees',
    title: '회비 감사',
    description: '동아리 회비 운영 현황 조회와 감사',
    group: '동아리',
    icon: FileSearch,
  },
  {
    href: '/admin/leader-succession',
    title: '회장 승계',
    description: 'OFFICER 의 회장 승계 요청 검토 및 처리',
    group: '동아리',
    icon: Repeat2,
    pendingCountKey: 'leaderSuccession',
  },
  {
    href: '/admin/bank-matching',
    title: 'BANK 자동매칭',
    description: '은행 입금 자동매칭에 사용할 동아리 등록·해제',
    group: '동아리',
    icon: Landmark,
  },
  {
    href: '/admin/notices',
    title: '공지 관리',
    description: '학생/동아리 대상 공지 작성·수정·노출 범위 설정',
    group: '커뮤니티 운영',
    icon: Newspaper,
  },
  {
    href: '/admin/faqs',
    title: 'FAQ 관리',
    description: '총동연 자주 묻는 질문 작성·정렬·공개 관리',
    group: '커뮤니티 운영',
    icon: HelpCircle,
  },
  {
    href: '/admin/inquiries',
    title: '1:1 문의',
    description: '학생 비밀문의 답변·상태 관리',
    group: '커뮤니티 운영',
    icon: MessageSquareText,
    pendingCountKey: 'inquiryUnanswered',
  },
  {
    href: '/admin/global-events',
    title: '글로벌 이벤트',
    description: '학교 단위 행사 일정 작성·수정·삭제 + 카테고리 분포',
    group: '커뮤니티 운영',
    icon: Globe,
  },
  {
    href: '/admin/reports',
    title: '신고 관리',
    description: '신고 접수 검토 및 해결/기각 처리',
    group: '커뮤니티 운영',
    icon: CircleAlert,
    pendingCountKey: 'reportUnresolved',
    danger: true,
  },
  {
    href: '/admin/users',
    title: '회원 관리',
    description: '회원 검색과 강제 로그아웃 등 계정 조치를 처리합니다.',
    group: '커뮤니티 운영',
    icon: UserCog,
  },
  {
    href: '/admin/promotion-requests',
    title: '홍보 요청',
    description: '동아리 홍보 배너 요청 검토 및 승인',
    group: '커뮤니티 운영',
    icon: Megaphone,
    parent: 'promotions',
    pendingCountKey: 'promotionRequest',
  },
  {
    href: '/admin/promotions',
    title: '홍보 배너',
    description: '메인 노출 홍보 배너 등록·수정·활성화 관리',
    group: '커뮤니티 운영',
    icon: Megaphone,
    parent: 'promotions',
  },
];

export const ADMIN_SECTION_GROUP_ORDER: AdminSectionGroup[] = ['동아리', '커뮤니티 운영'];
