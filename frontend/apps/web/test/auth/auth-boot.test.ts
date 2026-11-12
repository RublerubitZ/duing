import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@duing/stores';
import type { User } from '@duing/types';

import {
  HAD_SESSION_KEY,
  SESSION_USER_KEY,
  consumeBootSessionRestore,
  hadSession,
  markHadSession,
  seedAuthFromLocalHistory,
  sessionChangeNotice,
  setConfirmedSessionUser,
  startBootSessionRestore,
  webConnectivityAdapter,
} from '@/app/_lib/authBoot';

const API_BASE_URL = 'http://localhost:8080/api/v1';
// 문구는 리터럴로 적는다 — 상수를 import 하면 문구가 바뀌어도 통과한다.
const ENDED_TEXT = '로그아웃되었어요. 이 화면에서는 저장되지 않아요.';
const SWITCHED_TEXT = '다른 탭에서 로그인 상태가 바뀌었어요. 이 화면에서는 저장되지 않아요.';
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

describe('공유 사용자 표지 — 요청 시점 판정', () => {
  afterEach(() => {
    setConfirmedSessionUser(undefined);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function shareSessionUser(value: string | null) {
    if (value === null) window.localStorage.removeItem(SESSION_USER_KEY);
    else window.localStorage.setItem(SESSION_USER_KEY, value);
  }

  // 표지가 지워졌으면 로그아웃인지 만료인지 이 탭에선 가를 수 없다 — 결과(로그아웃)만 말한다.
  it.each<[string, string | null, string | null, string | null]>([
    ['같은 사용자', null, '1', '1'],
    ['다른 탭이 다른 계정으로 로그인', SWITCHED_TEXT, '1', '2'],
    ['다른 탭이 로그아웃하거나 세션이 만료됨(표지 없음)', ENDED_TEXT, '1', null],
    ['비로그인 확인 탭에서 다른 탭이 로그인', SWITCHED_TEXT, null, '2'],
    ['둘 다 비로그인', null, null, null],
  ])('%s → 안내 문구', (_label, notice, confirmed, shared) => {
    setConfirmedSessionUser(confirmed);
    shareSessionUser(shared);
    expect(sessionChangeNotice()).toBe(notice);
  });

  it('확인 전이면 저장소를 읽지 않고 다르지 않다고 본다', () => {
    shareSessionUser('2');
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    expect(sessionChangeNotice()).toBeNull();
    expect(getItemSpy).not.toHaveBeenCalled();
  });

  it('공유 표지를 읽지 못하면 비교하지 않는다', () => {
    setConfirmedSessionUser('1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(sessionChangeNotice()).toBeNull();
  });

  it('연결 어댑터 — 명시적 오프라인이면 false', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(webConnectivityAdapter()).toBe(false);
  });

  it('연결 어댑터 — onLine 이 없으면(서버의 Node 전역 navigator) 온라인으로 보고 판정을 따른다', () => {
    vi.stubGlobal('navigator', {});
    expect(webConnectivityAdapter()).toBe(true);
    setConfirmedSessionUser('1');
    shareSessionUser('2');
    expect(webConnectivityAdapter()).toBe(SWITCHED_TEXT);
  });

  // 막을 때는 원인 문구를 돌려준다 — packages/api 가 그 문구로 요청을 실패시킨다('인터넷 연결' 대신).
  it('연결 어댑터 — 온라인이어도 다른 탭이 사용자를 바꿨으면 계정 전환 문구', () => {
    setConfirmedSessionUser('1');
    shareSessionUser('2');
    expect(webConnectivityAdapter()).toBe(SWITCHED_TEXT);
  });

  it('연결 어댑터 — 다른 탭이 표지를 지웠으면(로그아웃·만료) 로그아웃 문구', () => {
    setConfirmedSessionUser('1');
    shareSessionUser(null);
    expect(webConnectivityAdapter()).toBe(ENDED_TEXT);
  });

  it.each<[string, string, string, boolean | string]>([
    ['로그인은 보낸다', 'POST', 'auth/web/login', true],
    ['로그아웃은 막는다', 'POST', 'auth/web/logout', SWITCHED_TEXT],
    ['가입은 막는다', 'POST', 'auth/signup', SWITCHED_TEXT],
    ['다른 요청은 막는다', 'GET', 'users/me', SWITCHED_TEXT],
  ])('연결 어댑터 — 다른 탭이 사용자를 바꿨어도 %s', (_label, method, path, verdict) => {
    setConfirmedSessionUser('1');
    shareSessionUser('2');
    expect(webConnectivityAdapter(new Request(`${API_BASE_URL}/${path}`, { method }))).toBe(verdict);
  });

  it('연결 어댑터 — 명시적 오프라인이면 로그인 요청도 false', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(webConnectivityAdapter(new Request(`${API_BASE_URL}/auth/web/login`, { method: 'POST' }))).toBe(false);
  });
});
