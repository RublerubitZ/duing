import { useAuthStore } from '@duing/stores';

import type { User } from '@duing/types';

// 이 브라우저에서 세션이 살아 있던 적이 있는지 표시하는 로컬 플래그.
// 갱신은 AuthSessionBootstrap 의 status 구독 한 곳에서만 한다(그 파일의 주석 참조).
// 저장소는 웹 전용이라 packages/* 가 아닌 앱 계층에 둔다.
export const HAD_SESSION_KEY = 'duing:had-session';

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

// §9.2 3단 시드의 클라이언트 층(신호 없음 행) — 로컬 이력이 있으면 authenticated 로 추정한다.
// 이력이 없으면 스토어 초기값(unauthenticated)이 곧 시드다. 홈에서는 A′ 서버 시드(AuthHintSeed)가
// 이 값을 승격할 수 있다. 시드가 틀렸다면 서버 확인(부트스트랩/만료 핸들러)이 정정한다.
export function seedAuthFromLocalHistory(): void {
  if (typeof window === 'undefined') return;
  if (hadSession()) useAuthStore.getState().seedSession('authenticated');
}

// 레버 1(§4) — 세션 복원 요청을 모듈 평가 시점(하이드레이션 전)에 선점한다.
// 일반 클라이언트 경로를 그대로 탄다: 401 이면 afterResponse 훅이 refresh 조율기
// (ensureFreshSession)를 경유해 갱신 후 재시도한다 — 조율기 우회 없음.
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
