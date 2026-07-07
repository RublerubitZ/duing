// 정보(Information) 섹션 단일 정의(SoT) — InfoTabs·ExploreNav·InfoNavLink(HomeNav)·BottomNav 가 공유한다.
// 새 정보 페이지 추가 = INFO_MENU_ITEMS 에 1줄 추가(탭 노출·GNB/탭바 active·저장값 검증이 함께 따라온다).
export const INFO_MENU_ITEMS = [
  { label: '공지', href: '/notices' },
  { label: '자주 묻는 질문', href: '/faq' },
  { label: '운영정책', href: '/terms' },
  { label: '서비스 소개', href: '/introduce' },
] as const;

export type InfoPath = (typeof INFO_MENU_ITEMS)[number]['href'];

export const DEFAULT_INFO_PATH: InfoPath = '/notices';

const LAST_INFO_PATH_STORAGE_KEY = 'duing:info-last-path';

/**
 * 정보 섹션 여부(상세 포함 — /notices/123 도 true).
 * GNB·BottomNav 의 "정보" active 판정 전용. InfoTabs 노출 판단에는 쓰지 않는다
 * (노출은 조건부 렌더링이 아니라 허브 4페이지에 대한 수동 배치로 결정).
 */
export function isInfoSection(pathname: string): boolean {
  return INFO_MENU_ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  );
}

/**
 * InfoTabs 를 표시하는 허브 페이지 여부(exact 매칭 — 상세 페이지는 false).
 * 방문 기록 가드·저장값 검증 전용.
 */
export function isInfoHubPage(pathname: string): pathname is InfoPath {
  return INFO_MENU_ITEMS.some((item) => item.href === pathname);
}

/** 마지막 방문 허브 경로를 기록한다. 허브 페이지가 아니면 무시. SSR·localStorage 차단 환경도 무시. */
export function rememberInfoPath(pathname: string): void {
  if (typeof window === 'undefined') return;
  if (!isInfoHubPage(pathname)) return;
  try {
    window.localStorage.setItem(LAST_INFO_PATH_STORAGE_KEY, pathname);
  } catch {
    // localStorage 차단 — 기억 기능만 저하(기본 /notices 진입), 탐색 자체는 정상이라 조용히 무시.
  }
}

/**
 * GNB·BottomNav "정보" 메뉴의 이동 정책 단일 지점 — 항상 유효한 허브 경로를 반환한다.
 * 저장값이 없거나 허브 경로가 아니면(손상 포함) DEFAULT_INFO_PATH(/notices) 폴백.
 */
export function getLastInfoPath(): InfoPath {
  if (typeof window === 'undefined') return DEFAULT_INFO_PATH;
  try {
    const stored = window.localStorage.getItem(LAST_INFO_PATH_STORAGE_KEY);
    if (stored !== null && isInfoHubPage(stored)) return stored;
    return DEFAULT_INFO_PATH;
  } catch {
    return DEFAULT_INFO_PATH;
  }
}
