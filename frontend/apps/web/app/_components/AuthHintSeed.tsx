'use client';

import { useState } from 'react';

import { useAuthStore } from '@duing/stores';

// A′(§5.2) — (home) 레이아웃이 서버에서 검증한 auth_hint 유무를 클라 스토어에 반영한다.
// 승격 전용: 서버가 로그인으로 봤을 때만 시드한다. 힌트 부재·무효는 시드하지 않는다 —
// 로컬 이력 기반 추정(§9.2 3단: 신호 없음+이력 있음=유지)을 미인증으로 내리면,
// AUTH_HINT_SECRET 로테이션·힌트 만료 같은 정상 상황에서 로그인 사용자 전원이 로그아웃 화면을 본다.
// 렌더 페이즈(lazy useState)에서 1회 적용한다 — 하이드레이션이 끝나고 스토어 구독이 값을 재확인하기
// 전에 반영돼야 첫 커밋부터 시드가 보인다. 서버 렌더에서는 아무것도 하지 않는다(모듈 스코프
// 서버 스토어는 요청 간 공유라, 요청별 값을 쓰면 동시 요청끼리 오염된다).
export function AuthHintSeed({ authenticated }: { authenticated: boolean }) {
  useState(() => {
    if (typeof window === 'undefined' || !authenticated) return;
    useAuthStore.getState().seedSession('authenticated');
  });
  return null;
}
