import { DEFAULT_INFO_PATH, isInfoSection, type InfoPath } from './infoMenu';

export type MainNavItem = {
  label: string;
  href: '/' | '/clubs' | '/facilities' | '/calendar' | InfoPath;
  /** 단일 prefix 로 판정할 수 없는 항목(소식)만 지정. */
  match?: (pathname: string) => boolean;
};

/** PC 상단바(HomeNav·ExploreNav) 공용 항목 — 라벨·경로의 단일 정의. 모바일 탭바(BottomNav)는 구성이 달라 별도. */
export const MAIN_NAV_ITEMS: readonly MainNavItem[] = [
  { label: '홈', href: '/' },
  { label: '동아리', href: '/clubs' },
  { label: '시설', href: '/facilities' },
  { label: '일정', href: '/calendar' },
  { label: '소식', href: DEFAULT_INFO_PATH, match: isInfoSection },
];

/** '일정·시설' 한 탭 안의 형제 페이지 — CalendarPage·FacilityBookingPage 의 PageSegment 가 공유한다. */
export const CALENDAR_FACILITY_SEGMENT_ITEMS = [
  { label: '일정', href: '/calendar' },
  { label: '시설 예약', href: '/facilities' },
];

export function isMainNavActive(item: MainNavItem, pathname: string): boolean {
  if (item.match) return item.match(pathname);
  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(item.href + '/');
}
