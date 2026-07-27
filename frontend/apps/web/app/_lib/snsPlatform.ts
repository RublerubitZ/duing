import type { ClubSnsLink, ClubSnsPlatform } from '@duing/types';

/** 관리 폼의 플랫폼 선택지 라벨. 화면 표시 문구(snsPresentation)와 달리 저장 값의 이름이다. */
export const SNS_PLATFORM_LABELS: Record<ClubSnsPlatform, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  KAKAO: '카카오톡',
  OTHER: '기타',
};

/**
 * 아이콘·표시명을 붙일 수 있는 브랜드. 저장 플랫폼(4종)보다 넓다 —
 * GitHub·Discord 같은 링크는 전부 OTHER 로 저장되므로 URL 호스트로 알아낸다.
 */
export type SnsBrand =
  | 'INSTAGRAM' | 'FACEBOOK' | 'KAKAO'
  | 'DISCORD' | 'GITHUB' | 'YOUTUBE' | 'X' | 'NOTION' | 'FIGMA' | 'SLACK';

/** 라벨(무엇인지) + 값(누르면 뭐가 되는지) 한 쌍. 아이콘만 보고 유추하지 않게 둘 다 쓴다. */
export type SnsPresentation = { label: string; value: string };

/**
 * 브랜드별 표시 규칙 — 문구는 전부 여기서만 고친다.
 * 인스타그램·오픈채팅은 어느 동아리 계정인지가 중요해 라벨에 동아리명을 붙인다.
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

const BRAND_HOSTS: ReadonlyArray<readonly [SnsBrand, RegExp]> = [
  ['INSTAGRAM', /(^|\.)instagram\.com$/i],
  ['FACEBOOK', /(^|\.)(facebook\.com|fb\.com|fb\.me)$/i],
  ['KAKAO', /(^|\.)kakao\.com$/i],
  ['DISCORD', /(^|\.)(discord\.com|discord\.gg)$/i],
  ['GITHUB', /(^|\.)(github\.com|github\.io)$/i],
  ['YOUTUBE', /(^|\.)(youtube\.com|youtu\.be)$/i],
  ['X', /(^|\.)(x\.com|twitter\.com)$/i],
  ['NOTION', /(^|\.)(notion\.so|notion\.site|notion\.com)$/i],
  ['FIGMA', /(^|\.)figma\.com$/i],
  ['SLACK', /(^|\.)slack\.com$/i],
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** 저장 플랫폼이 OTHER 면 URL 호스트로 브랜드를 추론한다. 못 알아내면 null. */
export function snsBrand(link: ClubSnsLink): SnsBrand | null {
  if (link.platform !== 'OTHER') return link.platform;
  const host = hostOf(link.url);
  if (host === null) return null;
  return BRAND_HOSTS.find(([, pattern]) => pattern.test(host))?.[0] ?? null;
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

/**
 * instagram.com/{handle} 형태의 프로필 URL 에서 핸들만 뽑는다.
 * 게시물(/p/...)·릴스(/reel/...)처럼 경로가 두 칸 이상이면 프로필이 아니므로 null 을 돌려준다.
 */
export function instagramHandle(url: string): string | null {
  const host = hostOf(url);
  if (host === null || !/(^|\.)instagram\.com$/i.test(host)) return null;
  const [handle, ...rest] = new URL(url).pathname.split('/').filter(Boolean);
  if (handle === undefined || rest.length > 0) return null;
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? handle : null;
}
