import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setStorage } from '@duing/storage';
import { selectIsAuthenticated, useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

// clearSession() 은 clearToken() 을 거치고, storage 미주입이면 getStorage() 가 throw 한다.
// 스토어 상태 전이만 보는 테스트이므로 빈 저장소를 주입한다(session-judgment.test.tsx 와 동일).
const EMPTY_STORAGE = {
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
};
setStorage(EMPTY_STORAGE);

const TEST_USER: User = {
  id: 1, studentId: '20240001', name: '홍길동', phone: '010-1234-5678',
  grade: 'FRESHMAN', role: 'STUDENT',
};

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

afterEach(() => {
  setStorage(EMPTY_STORAGE);
});

describe('auth-store 상태 모델 (§8)', () => {
  it('초기값은 정적이다 — unauthenticated · 미검증 (SSR/프리렌더가 이 값으로 그려진다)', () => {
    const initial = useAuthStore.getInitialState();
    expect(initial.status).toBe('unauthenticated');
    expect(initial.isVerified).toBe(false);
    expect(initial.user).toBeNull();
  });

  it('seedSession 은 status 만 바꾸고 검증 표식을 세우지 않는다', () => {
    useAuthStore.getState().seedSession('authenticated');
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().isVerified).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('서버로 확인된 상태는 시드가 덮지 못한다 — 로그아웃 확정 후 시드 무시', async () => {
    await useAuthStore.getState().clearSession();
    useAuthStore.getState().seedSession('authenticated');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().isVerified).toBe(true);
  });

  it('setSession 은 검증된 로그인 상태를 세운다', () => {
    useAuthStore.getState().setSession(TEST_USER);
    expect(useAuthStore.getState()).toMatchObject({
      status: 'authenticated', isVerified: true, user: TEST_USER,
    });
  });

  it('clearSession 은 검증된 미인증 상태를 세운다', async () => {
    useAuthStore.getState().setSession(TEST_USER);
    await useAuthStore.getState().clearSession();
    expect(useAuthStore.getState()).toMatchObject({
      status: 'unauthenticated', isVerified: true, user: null,
    });
  });

  it('setSession 은 세션 개시 시각을 기록하고 clearSession 은 지운다 (#845)', async () => {
    expect(useAuthStore.getState().sessionOpenedAt).toBeNull();
    const beforeOpen = performance.now();
    useAuthStore.getState().setSession(TEST_USER);
    const { sessionOpenedAt } = useAuthStore.getState();
    expect(sessionOpenedAt).not.toBeNull();
    expect(sessionOpenedAt).toBeGreaterThanOrEqual(beforeOpen);
    await useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().sessionOpenedAt).toBeNull();
  });

  it('저장소 정리를 기다리는 사이 들어온 로그인을 늦은 set 이 덮지 않는다', async () => {
    let release!: () => void;
    setStorage({
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => new Promise<void>((resolve) => { release = resolve; }),
    });
    const NEXT_USER: User = { ...TEST_USER, id: 2, studentId: '20240002' };
    useAuthStore.getState().setSession(TEST_USER);
    const pending = useAuthStore.getState().clearSession();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    useAuthStore.getState().setSession(NEXT_USER);
    release();
    await pending;
    const finalState = useAuthStore.getState();
    expect(finalState.user).toBe(NEXT_USER);
    expect(finalState.status).toBe('authenticated');
    expect(finalState.sessionOpenedAt).not.toBeNull();
  });

  it('저장소 정리가 실패해도 종료 상태는 반영된다', async () => {
    setStorage({
      getItem: () => Promise.resolve(null),
      setItem: () => Promise.resolve(),
      removeItem: () => Promise.reject(new Error('storage unavailable')),
    });
    useAuthStore.getState().setSession(TEST_USER);
    await expect(useAuthStore.getState().clearSession()).rejects.toThrow('storage unavailable');
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('selectIsAuthenticated 는 시드·확정을 구분하지 않는다 (§10 게이트 술어)', () => {
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(false);
    useAuthStore.getState().seedSession('authenticated');
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(true);
  });
});
