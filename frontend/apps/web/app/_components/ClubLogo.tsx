'use client';

import { useState, type ReactNode } from 'react';

type Props = {
  /** Storage URL 또는 외부 이미지 URL. null/빈문자열이면 children 으로 fallback. */
  logoUrl: string | null | undefined;
  /** 시맨틱 alt. 장식용일 땐 빈 문자열 또는 생략. */
  alt?: string;
  /** logoUrl 이 없거나 로드 실패 시 표시할 fallback. 사이즈/모양/배경은 호출처 컨테이너 책임. */
  children?: ReactNode;
};

/**
 * 동아리 로고 이미지 표시 전용 leaf 컴포넌트.
 *
 * - logoUrl 있고 로드 성공 → `<img absolute inset-0 w-full h-full object-cover>` 렌더
 * - logoUrl 없거나 onError 발생 → children fallback 렌더
 * - logoUrl 이 새 URL 로 변경되면 derived state(`errorSrc !== logoUrl`) 로 자동 reset (useEffect 없음, 깜빡임 없음)
 *
 * 호출처 컨테이너가 `relative + overflow-hidden + 사이즈/모양/배경` 을 책임진다.
 */
export function ClubLogo({ logoUrl, alt, children }: Props) {
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const useImage = !!logoUrl && errorSrc !== logoUrl;

  if (useImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 외부 Storage URL. next/image 도메인 화이트리스트 후속 PR 예정.
      <img
        src={logoUrl}
        alt={alt ?? ''}
        className="absolute inset-0 w-full h-full object-cover"
        onError={() => setErrorSrc(logoUrl)}
      />
    );
  }
  return <>{children}</>;
}
