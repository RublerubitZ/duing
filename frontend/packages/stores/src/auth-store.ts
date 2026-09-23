import { create } from 'zustand';

import { clearToken } from '@duing/api';

import type { User } from '@duing/types';

export type AuthStatus = 'authenticated' | 'unauthenticated';

type AuthState = {
  user: User | null;
  /**
   * 현재 최선의 판단(시드 또는 서버 확정). "모른다"를 표현하지 않는다 — 화면은 이 값으로만 그린다.
   *
   * @deprecated apps/web 화면 렌더는 이 값을 직접 비교하지 말고 useSeededAuthStatus 로 읽는다(§8.1) —
   * SSR 스냅샷이 서버 시드와 어긋나면 하이드레이션 불일치(React #419)가 된다. isVerified 를 함께 보는
   * 만료 축(AuthSessionBootstrap·SessionExpiryHandler)과 packages 내부는 예외다.
   */
  status: AuthStatus;
  /** 서버 응답으로 확인된 값인가. 되돌릴 수 없는 동작·만료 처리 발동에만 함께 본다 — 화면 분기 금지. */
  isVerified: boolean;
  /**
   * 서버 확인으로 세션이 열린 시각. 이보다 먼저 시작한 갱신의 종료 통지는 이 세션과 무관하다(#845).
   * 벽시계가 아니라 문서 단조 시각(performance.now())이다 — 벽시계가 OS 시각 보정으로 역행하면 이후 모든
   * 정당한 만료 통지가 "개시 이전" 으로 걸러져 401 만 받는 상태가 고착된다. 인메모리라 문서마다 새로 잡힌다.
   */
  sessionOpenedAt: number | null;
  /** 의도적 로그아웃 진행 중 — 만료 통지의 안내·이동 부수효과를 막는다(#845). */
  isLoggingOut: boolean;
  /** 부팅 시드(로컬 이력·A′ 서버 힌트). 서버로 확인된 상태는 덮지 않는다. */
  seedSession(status: AuthStatus): void;
  setSession(user: User): void;
  clearSession(): Promise<void>;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  // 초기값은 반드시 정적 — SSR/프리렌더 HTML 과 하이드레이션 첫 렌더가 이 값으로 그려지고
  // (zustand v5 useSyncExternalStore 의 서버 스냅샷 = getInitialState), 시드는 전부 "업데이트"로만
  // 적용된다. 초기값을 환경(localStorage·쿠키)에서 계산하면 하이드레이션 불일치(React #419)다.
  status: 'unauthenticated',
  isVerified: false,
  sessionOpenedAt: null,
  isLoggingOut: false,
  seedSession(status) {
    if (get().isVerified) return;
    set({ status });
  },
  setSession(user) {
    set({ user, status: 'authenticated', isVerified: true, sessionOpenedAt: performance.now() });
  },
  async clearSession() {
    // 호출부(로그아웃·전체 로그아웃·탈퇴·만료 확정)는 전부 서버가 확인한 종료 경로다.
    // 상태를 먼저 내린다 — 저장소 정리를 기다리는 사이 들어온 로그인(setSession)을 늦은 set 이
    // 덮지 않고, 저장소 접근 실패에도 종료 상태는 반영된다. clearToken 은 뒤따르는 로그인의
    // writeToken 보다 먼저 큐잉되므로(client.ts bearer 로그인) 새 토큰을 지우지 않는다 — bearer 모드
    // 전제이며, 웹 쿠키 모드는 토큰 저장소를 쓰지 않아 순서 자체가 무관하다.
    set({ user: null, status: 'unauthenticated', isVerified: true, sessionOpenedAt: null });
    await clearToken();
  },
}));

// 인증 종속 쿼리 게이트의 단일 술어(§10) — 소비자가 raw status 를 직접 비교하지 않게 한다.
// 시드된 authenticated 도 참: 신호가 로그인으로 보이면 확인을 기다리지 않고 요청한다.
// 401 이면 API 계층이 갱신하고, 정말 미인증이면 만료 경로로 흐른다.
export const selectIsAuthenticated = (state: { status: AuthStatus }): boolean =>
  state.status === 'authenticated';
