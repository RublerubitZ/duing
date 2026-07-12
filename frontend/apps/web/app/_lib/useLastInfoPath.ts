'use client';

import { useEffect, useState } from 'react';

import { DEFAULT_INFO_PATH, getLastInfoPath, isInfoHubPage, type InfoPath } from './infoMenu';

/**
 * GNB·하단 탭바 "정보" 링크의 목적지(마지막 방문 허브 경로, 없으면 /notices).
 * 초기 렌더는 기본 경로로 서버 렌더와 일치시키고(하이드레이션 mismatch 방지) 마운트 후 교체한다.
 * pathname 을 deps 로 받는 이유: BottomNav 는 root layout 에 1회 마운트되어 내비게이션 간
 * 인스턴스가 유지되므로, 경로가 바뀔 때마다 다시 읽지 않으면 이전 저장값이 남는다.
 *
 * 현재 페이지가 허브면 저장값 대신 현재 경로를 반환한다 — "마지막 방문"은 지금 보고 있는
 * 허브 자신이다. 이 보정이 없으면 허브 페이지에서 ExploreNav(앞 sibling)의 읽기 effect 가
 * InfoTabs(뒤 sibling)의 기록 effect 보다 먼저 실행되어 직전 허브 경로가 href 에 남는다.
 * pathname 분기는 서버/클라이언트 렌더에서 동일하게 계산되므로 하이드레이션 mismatch 가 없다.
 */
export function useLastInfoPath(pathname: string): InfoPath {
  const [lastInfoPath, setLastInfoPath] = useState<InfoPath>(DEFAULT_INFO_PATH);

  useEffect(() => {
    setLastInfoPath(getLastInfoPath());
  }, [pathname]);

  return isInfoHubPage(pathname) ? pathname : lastInfoPath;
}
