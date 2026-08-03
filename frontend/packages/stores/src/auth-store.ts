import { create } from 'zustand';

import { clearToken } from '@duing/api';

import type { User } from '@duing/types';

export type AuthStatus = 'authenticated' | 'unauthenticated';

type AuthState = {
  user: User | null;
  /** 현재 최선의 판단(시드 또는 서버 확정). "모른다"를 표현하지 않는다 — 화면은 이 값으로만 그린다. */
  status: AuthStatus;
  /** 서버 응답으로 확인된 값인가. 되돌릴 수 없는 동작·만료 처리 발동에만 함께 본다 — 화면 분기 금지. */
  isVerified: boolean;
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
  seedSession(status) {
    if (get().isVerified) return;
    set({ status });
  },
  setSession(user) {
    set({ user, status: 'authenticated', isVerified: true });
  },
  async clearSession() {
    await clearToken();
    // 호출부(로그아웃·전체 로그아웃·탈퇴·만료 확정)는 전부 서버가 확인한 종료 경로다.
    set({ user: null, status: 'unauthenticated', isVerified: true });
  },
}));

// 인증 종속 쿼리 게이트의 단일 술어(§10) — 소비자가 raw status 를 직접 비교하지 않게 한다.
// 시드된 authenticated 도 참: 신호가 로그인으로 보이면 확인을 기다리지 않고 요청한다.
// 401 이면 API 계층이 갱신하고, 정말 미인증이면 만료 경로로 흐른다.
export const selectIsAuthenticated = (state: { status: AuthStatus }): boolean =>
  state.status === 'authenticated';
