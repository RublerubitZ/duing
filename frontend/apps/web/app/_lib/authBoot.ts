import { useAuthStore } from '@duing/stores';

import type { User } from '@duing/types';

import { HAD_SESSION_KEY } from './hadSessionKey';

// 이 브라우저에서 세션이 살아 있던 적이 있는지 표시하는 로컬 플래그.
// 갱신은 AuthSessionBootstrap 의 status 구독 한 곳에서만 한다(그 파일의 주석 참조).
// 저장소는 웹 전용이라 packages/* 가 아닌 앱 계층에 둔다.
export { HAD_SESSION_KEY };

export function markHadSession(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(HAD_SESSION_KEY, '1');
    else window.localStorage.removeItem(HAD_SESSION_KEY);
  } catch {
    // 저장소를 못 쓰는 환경(사파리 프라이빗 등)에서는 이력 시드·알림이 생략된다 —
    // 세션 복원(서버 확인)은 그대로 동작하지만, A′ 밖 라우트는 확인 완료까지 미인증으로
    // 그려진다(스펙 §7.2 관측 대상).
  }
}

export function hadSession(): boolean {
  try {
    return window.localStorage.getItem(HAD_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

// 지금 이 브라우저에 로그인한 사용자(서버로 확인된 user id) — 다른 탭이 계정이 바뀐 것을 알아채는 공유 표지다.
// 비로그인 확정이면 키가 없다. had-session 처럼 갱신은 AuthSessionBootstrap 의 전이 한 곳에서만 한다.
// 값은 내부 대리키 id 다(학번·이름 아님) — 운영에서는 같은 값이 PostHog distinct_id 로 이미 localStorage 에 있고
// (persistence 기본값), 확정 로그아웃·만료 때 지운다. 확정 전이 없이 브라우저를 닫으면 다음 부팅 확인까지 남는다(had-session 과 같다).
export const SESSION_USER_KEY = 'duing:auth:session-user';

// 성공 여부를 돌려준다 — 쓰지 못한 탭은 비교하지 않아야 읽기만 되는 저장소에서 새로고침이 되풀이되지 않는다.
export function writeSessionUser(value: string | null): boolean {
  try {
    if (value === null) window.localStorage.removeItem(SESSION_USER_KEY);
    else window.localStorage.setItem(SESSION_USER_KEY, value);
    return true;
  } catch {
    return false;
  }
}

// 읽지 못하면 undefined — 호출부는 비교를 건너뛴다(저장소를 못 쓰는 환경은 지금 동작 그대로).
export function readSessionUser(): string | null | undefined {
  try {
    return window.localStorage.getItem(SESSION_USER_KEY);
  } catch {
    return undefined;
  }
}

// §9.2 3단 시드의 클라이언트 층(신호 없음 행) — 로컬 이력이 있으면 authenticated 로 추정한다.
// 이력이 없으면 스토어 초기값(unauthenticated)이 곧 시드다. 홈 ISR 전환(#925) 이후 웹 라우트에
// A′ 서버 시드 전달자는 없다 — 시드가 틀렸다면 서버 확인(부트스트랩/만료 핸들러)이 정정한다.
export function seedAuthFromLocalHistory(): void {
  if (typeof window === 'undefined') return;
  if (hadSession()) useAuthStore.getState().seedSession('authenticated');
}

// 레버 1(§4) — 세션 복원 요청을 모듈 평가 시점(하이드레이션 전)에 선점한다.
// 일반 클라이언트 경로를 그대로 탄다: 401 이면 afterResponse 훅이 refresh 조율기
// (ensureFreshSession)를 경유해 갱신 후 재시도한다 — 조율기 우회 없음.
// 통지는 refresh 시작 시각을 싣고, 세션 개시 이전에 시작한 갱신의 통지는 무시한다(#845) — 이 느린 체인이
// 로그인 완료와 겹쳐도 새 세션을 내리지 않는다.
// me 만 쓰므로 구조적 타입으로 받는다(테스트에서 전체 클라이언트 불필요).
type BootRestoreClient = { users: { me(): Promise<User> } };

let bootSessionPromise: Promise<User> | null = null;

export function startBootSessionRestore(client: BootRestoreClient): void {
  if (typeof window === 'undefined' || bootSessionPromise !== null) return;
  bootSessionPromise = client.users.me();
  // 소비 전 거부가 unhandled rejection 소음이 되지 않게 별도 체인으로 삼킨다(원본은 보존).
  bootSessionPromise.catch(() => {});
}

export function consumeBootSessionRestore(): Promise<User> | null {
  const consumed = bootSessionPromise;
  bootSessionPromise = null;
  return consumed;
}
