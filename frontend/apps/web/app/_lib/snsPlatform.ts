import type { ClubSnsLink, ClubSnsPlatform } from '@duing/types';
import { safeExternalHref } from './route';

/** 관리 폼의 플랫폼 선택지 라벨. 화면 표시 문구(snsPresentation)와 달리 저장 값의 이름이다. */
export const SNS_PLATFORM_LABELS: Record<ClubSnsPlatform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  KAKAO: '카카오톡',
  OTHER: '기타',
};

/**
 * 아이콘·표시 문구를 붙일 수 있는 브랜드. 저장 플랫폼(4종)보다 넓다 —
 * GitHub·Discord 같은 링크는 전부 OTHER 로 저장되므로 URL 호스트로 알아낸다.
 * 배열이 원본이라 새 브랜드를 넣으면 아래 Record 세 개가 모두 컴파일 에러로 빠짐을 알려준다.
 */
export const SNS_BRANDS = [
  'INSTAGRAM', 'FACEBOOK', 'KAKAO',
  'DISCORD', 'GITHUB', 'YOUTUBE', 'X', 'NOTION', 'FIGMA', 'SLACK',
] as const;
export type SnsBrand = (typeof SNS_BRANDS)[number];

/** 라벨(무엇인지) + 값(누르면 뭐가 되는지) 한 쌍. 아이콘만 보고 유추하지 않게 둘 다 쓴다. */
export type SnsPresentation = { label: string; value: string };

/**
 * 브랜드별 표시 규칙 — 문구는 전부 여기서만 고친다.
 * 인스타그램·오픈채팅은 어느 동아리 계정인지가 중요해 라벨에 동아리명을 붙인다.
 *
 * 라벨 우선순위 주의: OTHER 는 저장 시 플랫폼명 입력이 강제(zod refine + BE @AssertTrue)라
 * 호스트로 알아낸 브랜드(GitHub·Discord 등)의 라벨은 운영진이 적은 이름에 밀린다.
 * 여기 적힌 라벨은 라벨이 비어 들어온 레거시 데이터용 폴백이고, 값(행동 문구)이 실제로 쓰이는 쪽이다.
 */
const BRAND_PRESENTATIONS: Record<SnsBrand, (clubName: string) => SnsPresentation> = {
  INSTAGRAM: (clubName) => ({ label: `${clubName} 인스타그램`, value: '프로필 보기' }),
  KAKAO: (clubName) => ({ label: `${clubName} 오픈채팅`, value: '참여하기' }),
  FACEBOOK: (clubName) => ({ label: `${clubName} 페이스북`, value: '페이지 보기' }),
  DISCORD: () => ({ label: 'Discord', value: '참가하기' }),
  GITHUB: () => ({ label: 'GitHub', value: '저장소 보기' }),
  YOUTUBE: () => ({ label: 'YouTube', value: '채널 보기' }),
  X: () => ({ label: 'X', value: '프로필 보기' }),
  NOTION: () => ({ label: 'Notion', value: '문서 보기' }),
  FIGMA: () => ({ label: 'Figma', value: '파일 보기' }),
  SLACK: () => ({ label: 'Slack', value: '참여하기' }),
};

/** 브랜드를 못 알아낸 링크. CONTACT 카드는 URL 목록이 아니라 연락 수단 목록이다. */
const GENERIC_PRESENTATION: SnsPresentation = { label: '공식 홈페이지', value: '방문하기' };

const BRAND_HOSTS: Record<SnsBrand, RegExp> = {
  INSTAGRAM: /(^|\.)instagram\.com$/i,
  FACEBOOK: /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i,
  KAKAO: /(^|\.)kakao\.com$/i,
  DISCORD: /(^|\.)(discord\.com|discord\.gg)$/i,
  GITHUB: /(^|\.)(github\.com|github\.io)$/i,
  YOUTUBE: /(^|\.)(youtube\.com|youtu\.be)$/i,
  X: /(^|\.)(x\.com|twitter\.com)$/i,
  NOTION: /(^|\.)(notion\.so|notion\.site|notion\.com)$/i,
  FIGMA: /(^|\.)figma\.com$/i,
  SLACK: /(^|\.)slack\.com$/i,
};

/** http(s) 로 열 수 있는 링크만 파싱한다 — `javascript://instagram.com/x` 도 호스트를 내주기 때문. */
function safeHostOf(url: string): string | null {
  const safeUrl = safeExternalHref(url);
  if (safeUrl === null) return null;
  try {
    return new URL(safeUrl).hostname || null;
  } catch {
    return null;
  }
}

/**
 * 브랜드는 저장된 플랫폼이 아니라 URL 호스트로만 정한다.
 * 카드가 URL 을 감추므로, 플랫폼만 믿고 로고를 붙이면 엉뚱한 주소에 브랜드 신원을 빌려주게 된다
 * (실제로 platform=INSTAGRAM 인데 다른 사이트를 가리키는 데이터가 운영에 있다).
 */
export function snsBrand(link: ClubSnsLink): SnsBrand | null {
  const host = safeHostOf(link.url);
  if (host === null) return null;
  return SNS_BRANDS.find((brand) => BRAND_HOSTS[brand].test(host)) ?? null;
}

/**
 * 화면에 보여줄 라벨·값. URL 전체 대신 사람이 읽는 문구만 남긴다.
 * 인스타그램은 계정을 구분해야 하므로 값이 핸들(@id)이고, 못 뽑으면 브랜드 기본 문구로 떨어진다.
 */
export function snsPresentation(link: ClubSnsLink, clubName: string): SnsPresentation {
  const brand = snsBrand(link);
  const typedLabel = link.platform === 'OTHER' ? link.label?.trim() : undefined;
  const preset = brand !== null ? BRAND_PRESENTATIONS[brand](clubName) : GENERIC_PRESENTATION;
  const label = typedLabel || preset.label;
  if (brand === 'INSTAGRAM') {
    const handle = instagramHandle(link.url);
    if (handle !== null) return { label, value: `@${handle}` };
  }
  return { label, value: preset.value };
}

/** 프로필이 아닌 인스타그램 1단 경로 — `/explore` 를 `@explore` 계정으로 소개하면 안 된다. */
const INSTAGRAM_RESERVED_PATHS = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'tv', 'about', 'legal',
]);

/**
 * instagram.com/{handle} 형태의 프로필 URL 에서 핸들만 뽑는다.
 * 게시물(/p/...)·릴스(/reel/...)처럼 경로가 두 칸 이상이거나 예약 경로면 프로필이 아니므로 null.
 */
export function instagramHandle(url: string): string | null {
  const host = safeHostOf(url);
  if (host === null || !BRAND_HOSTS.INSTAGRAM.test(host)) return null;
  const [handle, ...rest] = new URL(url).pathname.split('/').filter(Boolean);
  if (handle === undefined || rest.length > 0) return null;
  if (INSTAGRAM_RESERVED_PATHS.has(handle.toLowerCase())) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}
