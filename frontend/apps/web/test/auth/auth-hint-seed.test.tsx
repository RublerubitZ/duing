import { beforeEach, describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { setStorage } from '@duing/storage';
import { useAuthStore } from '@duing/stores';
import { AuthHintSeed } from '@/app/_components/AuthHintSeed';

// clearSession() 은 clearToken() 을 거치고, storage 미주입이면 getStorage() 가 throw 한다
// (auth-store-model.test.ts 와 동일한 빈 저장소 주입).
setStorage({
  getItem: () => Promise.resolve(null),
  setItem: () => Promise.resolve(),
  removeItem: () => Promise.resolve(),
});

beforeEach(() => useAuthStore.setState(useAuthStore.getInitialState(), true));

describe('AuthHintSeed (A′ 서버 시드)', () => {
  it('서버가 로그인으로 봤으면 스토어를 authenticated 로 시드한다(미검증)', () => {
    render(<AuthHintSeed authenticated />);
    expect(useAuthStore.getState()).toMatchObject({ status: 'authenticated', isVerified: false });
  });

  it('힌트 부재·무효(false)는 시드하지 않는다 — 로컬 이력 추정을 미인증으로 내리면 오답(§9.2)', () => {
    useAuthStore.getState().seedSession('authenticated'); // 로컬 이력 층이 먼저 세운 값
    render(<AuthHintSeed authenticated={false} />);
    expect(useAuthStore.getState().status).toBe('authenticated');
  });

  it('검증된 상태는 덮지 않는다 — 로그아웃 확정 후 뒤늦은 시드 무시', async () => {
    await useAuthStore.getState().clearSession();
    render(<AuthHintSeed authenticated />);
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });
});
