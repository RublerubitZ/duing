import { isWebLoginRequest } from '@duing/api';
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
// 비로그인 확정이면 키가 없다. had-session 처럼 갱신은 AuthSessionBootstrap 의 전이에서 한다 — 예외는 로그인 성공 직후의 쓰기 하나(recordLoggedInSessionUser).
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

// 이 탭이 서버 확인 뒤 공유 표지에 쓰는 데 성공한 값 — undefined 면 확인 전이거나 쓰기에 실패해 비교하지 않는다.
// 요청마다 불리는 연결 어댑터가 읽어야 해 모듈 스코프에 둔다(문서당 하나 — AuthSessionBootstrap 이 갱신하고(로그인 성공 직후엔 recordLoggedInSessionUser 도) 언마운트 때 되돌린다).
let confirmedSessionUser: string | null | undefined;

export function setConfirmedSessionUser(value: string | null | undefined): void {
  confirmedSessionUser = value;
}

// 로그인 응답은 지금 쿠키의 사용자라 막힌 문서여도 정확하다 — 다른 탭이 곧바로 알아채게 한다(AuthSessionBootstrap 은 막힌 문서에서 쓰지 않는다).
// 확인값도 맞춘다 — 부트스트랩 effect 전에 '공유=새 id, 확인값=옛 값' 으로 이 탭의 요청이 막히지 않게.
export function recordLoggedInSessionUser(userId: number): void {
  const sessionUser = String(userId);
  // 쓰지 못하면 비교를 멈춘다(부트스트랩과 같다) — 읽기만 되는 저장소에서 남의 옛 값과 비교해 막지 않게.
  setConfirmedSessionUser(writeSessionUser(sessionUser) ? sessionUser : undefined);
}

// 다른 탭이 로그인 상태를 바꿔 이 문서의 요청을 막을 때의 안내 — 안내 토스트·막힌 요청의 오류가 같이 쓴다(같은 문구라 겹친 토스트는 ToastProvider 가 거른다).
// 표지가 지워졌으면 로그아웃인지 만료인지 이 탭에선 가를 수 없어(둘 다 표지를 지운다) 결과만 말한다.
export const SESSION_ENDED_MESSAGE = '로그아웃되었어요. 이 화면에서는 저장되지 않아요.';
export const SESSION_SWITCHED_MESSAGE =
  '다른 탭에서 로그인 상태가 바뀌었어요. 이 화면에서는 저장되지 않아요.';

// 공유 표지가 이 탭이 확인한 사용자와 다르면 그 안내 문구, 같거나 비교하지 않으면 null. 확인 전이면 저장소를 읽지 않고, 읽지 못하면 비교하지 않는다.
export function sessionChangeNotice(): string | null {
  if (confirmedSessionUser === undefined) return null;
  const sharedSessionUser = readSessionUser();
  if (sharedSessionUser === undefined || sharedSessionUser === confirmedSessionUser) return null;
  return sharedSessionUser === null ? SESSION_ENDED_MESSAGE : SESSION_SWITCHED_MESSAGE;
}

// 웹 연결 어댑터(providers 가 등록, 요청마다 불린다) — 다른 탭이 사용자를 바꿨으면 이벤트를 아직 못 받았어도(깨어난 동결 탭) 막는다.
// navigator.onLine 은 명시적 false 만 오프라인으로 본다(서버의 Node 전역 navigator 엔 onLine 이 없다).
// 로그인은 막지 않는다 — 쿠키도 함께 나가지만 서버 웹 로그인은 기존 인증 쿠키를 읽지 않고 입력한 자격 증명으로만 답해 다른 계정 데이터가 새지 않는다(동시 로그인의 늦은 탭).
// 막을 때는 안내 문구를 돌려준다 — 막힌 요청이 '인터넷 연결' 대신 원인 문구로 실패한다(packages/api 연결 어댑터 계약).
export function webConnectivityAdapter(request?: Request): boolean | string {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (request !== undefined && isWebLoginRequest(request)) return true;
  return sessionChangeNotice() ?? true;
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
