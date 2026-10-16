'use client';

import { useCallback, useState, type RefCallback } from 'react';

import { isBackNavigationPending } from './backNavigationViewTransition';
import { useHydrated } from './useHydrated';

type FadePhase = 'visible' | 'pending' | 'loaded';

type ImageLoadFade = {
  /** `<img>`·next/image 에 펼친다 — 마운트 때 캐시 적중 판정(ref)과 로드 완료·실패 통지. */
  imageProps: { ref: RefCallback<HTMLImageElement>; onLoad: () => void; onError: () => void };
  /** 투명도를 바꿀 요소의 클래스 — 보이는 상태면 undefined. */
  className: string | undefined;
};

// 등장 연출(enter-rise)과 같은 200ms·ease-duing. 동작 줄이기면 전이 없이 로드 즉시 보인다(motion-reduce:transition-none).
const FADE_IN_CLASS = 'opacity-100 transition-opacity duration-200 ease-duing motion-reduce:transition-none';

/**
 * 이미지 로드 페이드 — 클라이언트 이동으로 마운트된 이미지가 로드 완료 때 200ms 로 드러난다(커버·대표 활동 사진이 한 번에
 * 튀어나오던 것, iOS 깜빡임 P0 §6.2). 규칙:
 * - 하이드레이션 뒤 마운트(useHydrated 가 첫 렌더부터 true)이고 마운트 시점에 로드 전(complete=false)인 이미지만 투명도 0 에서 시작한다.
 * - 서버 HTML·하이드레이션 첫 렌더는 보이는 상태로 그린다 — 첫 화면의 큰 이미지를 투명도 0 으로 시작하면 LCP 가 늦다(실측 +212ms).
 *   판정은 마운트 시점 값으로 고정된다 — 하이드레이션 뒤 useHydrated 가 true 로 다시 그려도 바뀌지 않는다.
 * - 뒤로·앞으로 가기(data-back-navigation 마커)가 선 채 마운트되면 즉시 보인다 — 돌아온 화면에 연출을 붙이지 않는 관례
 *   (useEntranceMotion)와 같고, iOS 스와이프 백 스냅숏이 실제 화면으로 바뀐 직후 배너가 비는 시간을 늘리지 않는다.
 * - 마운트 때 이미 complete(캐시 적중)·로드 실패는 즉시 보인다 — 아직 그린 프레임이 없어 전이도 없다. raw <img>(대표 활동)는 캐시면
 *   이렇게 즉시지만, next/image(커버)는 srcset+lazy 라 ref 시점엔 캐시돼도 complete 가 false 인 경우가 많아 앞으로 이동으로
 *   다시 들어와도 짧게 페이드한다(팝은 아니다 — 허용).
 * imageProps 는 <img>·next/image 에 펼치고(next/image 는 ref 를 <img> 로 넘기고 캐시된 이미지도 decode 뒤 onLoad 를 부른다),
 * className 은 투명도를 바꿀 요소에 둔다 — 이미지에 고유 투명도(opacity-50)가 있으면 이미지가 아닌 감싸는 요소에 둔다(opacity
 * 유틸리티끼리 덮어쓴다). 전이는 로드 뒤 클래스에만 있어, 투명으로 시작하지 않은 경우(보임)엔 어떤 전이도 걸리지 않는다.
 */
export function useImageLoadFade(): ImageLoadFade {
  const hydrated = useHydrated();
  const [phase, setPhase] = useState<FadePhase>(() => (hydrated && !isBackNavigationPending() ? 'pending' : 'visible'));
  const ref = useCallback<RefCallback<HTMLImageElement>>((image) => {
    // 캐시 적중 — 마운트 때 이미 complete 면 숨기지 않는다(ref 는 그리기 전 커밋 단계에 불린다).
    if (image?.complete) setPhase((current) => (current === 'pending' ? 'visible' : current));
  }, []);

  return {
    imageProps: {
      ref,
      onLoad: () => setPhase((current) => (current === 'pending' ? 'loaded' : current)),
      onError: () => setPhase('visible'),
    },
    className: phase === 'pending' ? 'opacity-0' : phase === 'loaded' ? FADE_IN_CLASS : undefined,
  };
}
