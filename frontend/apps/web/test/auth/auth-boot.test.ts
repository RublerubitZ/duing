import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import {
  HAD_SESSION_KEY,
  consumeBootSessionRestore,
  hadSession,
  markHadSession,
  seedAuthFromLocalHistory,
  startBootSessionRestore,
} from '@/app/_lib/authBoot';

const TEST_USER: User = {
  id: 1, studentId: '20240001', name: '홍길동', phone: '010-1234-5678',
  grade: 'FRESHMAN', role: 'STUDENT',
};

// startBootSessionRestore 는 client.users.me 만 사용한다 — 구조적 타입으로 최소 클라이언트를 만든다.
function fakeClient(me: () => Promise<User>) {
  return { users: { me } };
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  window.localStorage.clear();
  // 모듈 스코프 1회 가드 리셋 — 소비해서 비운다.
  consumeBootSessionRestore();
});

describe('seedAuthFromLocalHistory (§9.2 3단 시드 — 신호 없음 행)', () => {
  it('로컬 이력이 있으면 authenticated 로 시드한다(미검증)', () => {
    window.localStorage.setItem(HAD_SESSION_KEY, '1');
    seedAuthFromLocalHistory();
    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().isVerified).toBe(false);
  });

  it('이력이 없으면 아무것도 하지 않는다 — 초기값(unauthenticated)이 곧 시드다', () => {
    seedAuthFromLocalHistory();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().isVerified).toBe(false);
  });
});

describe('had-session 플래그', () => {
  it('mark(true)→hadSession true, mark(false)→false', () => {
    markHadSession(true);
    expect(hadSession()).toBe(true);
    markHadSession(false);
    expect(hadSession()).toBe(false);
  });
});

describe('startBootSessionRestore (레버 1)', () => {
  it('모듈 평가 시점에 요청을 시작하고, 정확히 1회만 시작한다', () => {
    const me = vi.fn().mockResolvedValue(TEST_USER);
    startBootSessionRestore(fakeClient(me));
    startBootSessionRestore(fakeClient(me));
    expect(me).toHaveBeenCalledTimes(1);
  });

  it('소비는 1회 — 두 번째 consume 은 null (재시도는 새 요청을 쓴다)', async () => {
    const me = vi.fn().mockResolvedValue(TEST_USER);
    startBootSessionRestore(fakeClient(me));
    const first = consumeBootSessionRestore();
    expect(first).not.toBeNull();
    expect(consumeBootSessionRestore()).toBeNull();
    await expect(first).resolves.toEqual(TEST_USER);
  });

  it('선점 요청의 거부가 unhandled rejection 이 되지 않는다', async () => {
    const me = vi.fn().mockRejectedValue(new Error('만료'));
    startBootSessionRestore(fakeClient(me));
    // 소비자가 붙기 전 마이크로태스크 한 사이클 — unhandled 면 vitest 가 실패시킨다.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(consumeBootSessionRestore()).rejects.toThrow('만료');
  });
});
