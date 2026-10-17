'use client';

import { useState, type ReactNode } from 'react';

type Props = {
  /** Storage URL 또는 외부 이미지 URL. null/빈문자열이면 children 으로 fallback(thumbnailUrl 도 무시). */
  logoUrl: string | null | undefined;
  /**
   * 서버가 만든 384px 로고 썸네일 URL(ClubSummary·ClubDetail.logoThumbnailUrl). logoUrl 과 다르면 이 URL 을 먼저 즉시(eager·sync)
   * 그린다 — 작아서 동기 디코딩 비용이 작고, 뒤로가기·모핑 때 컨테이너 배경색 상자가 비치지 않는다. 실패하면 logoUrl(지금 속성 그대로)로
   * 물러선다. logoUrl 과 같으면(작은 원본 등) 크기를 몰라 원본 속성으로 한 번만 그린다. 없으면(구 응답·미생성·null)
   * logoUrl 만 지금처럼 그린다(fail-open).
   */
  thumbnailUrl?: string | null;
  /** 시맨틱 alt. 장식용일 땐 빈 문자열 또는 생략. */
  alt?: string;
  /** 후보 URL 이 없거나 모두 로드 실패 시 표시할 fallback. 사이즈/모양/배경은 호출처 컨테이너 책임. */
  children?: ReactNode;
};

/**
 * 동아리 로고 이미지 표시 전용 leaf 컴포넌트.
 *
 * - 후보는 [thumbnailUrl, logoUrl] 순 — 실패하지 않은 첫 후보를 `<img absolute inset-0 w-full h-full object-cover>` 로 렌더
 * - logoUrl 이 없으면 thumbnailUrl 도 무시한다(백엔드 #1473 계약 — 썸네일은 현재 로고에서 만든 변형이다)
 * - 원본과 다른 썸네일만 loading="eager" decoding="sync", 원본(원본과 같은 썸네일 포함)은 loading="lazy" decoding="async"
 *   (원본은 수백 KB~1.3MB 라 동기 디코딩 금지)
 * - 후보가 없거나 모두 onError → children fallback 렌더
 * - 실패한 URL 만 기억하는 derived state — URL 이 새 값으로 바뀌면 옛 실패는 후보와 어긋나 자동 reset (useEffect 없음, 깜빡임 없음)
 *
 * 호출처 컨테이너가 `relative + overflow-hidden + 사이즈/모양/배경` 을 책임진다.
 */
export function ClubLogo({ logoUrl, thumbnailUrl, alt, children }: Props) {
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const candidateUrls = logoUrl ? [thumbnailUrl, logoUrl].filter((url): url is string => !!url) : [];
  // 썸네일이 원본과 같은 URL 이면 한 번의 실패로 둘 다 걸러져 바로 children 이다 — 같은 URL 을 두 번 시도하지 않는다.
  const src = candidateUrls.find((url) => !failedUrls.includes(url));

  if (src === undefined) return <>{children}</>;
  // 후보는 썸네일·원본 둘뿐이라 원본이 아니면 서버가 만든 384px 썸네일이다. 원본과 같은 값은 크기를 몰라 원본 속성으로 그린다.
  const isThumbnail = src !== logoUrl;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. next/image 도메인 화이트리스트 후속 PR 예정.
    <img
      src={src}
      alt={alt ?? ''}
      loading={isThumbnail ? 'eager' : 'lazy'}
      decoding={isThumbnail ? 'sync' : 'async'}
      draggable={false}
      className="absolute inset-0 w-full h-full object-cover"
      onError={() => setFailedUrls((previous) => [...previous, src])}
    />
  );
}
