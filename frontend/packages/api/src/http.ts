import { HTTPError, TimeoutError } from 'ky';
import type { ApiResponse } from '@duing/types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly payload?: unknown,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// 사용자 대면 네트워크 오류 안내 문구 — 전 화면의 `error instanceof ApiError ? error.message : …`
// 패턴이 그대로 노출하므로 여기 한 곳에서만 관리한다. (스펙 §3.2)
export const TIMEOUT_ERROR_MESSAGE = '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
export const NETWORK_ERROR_MESSAGE = '인터넷 연결을 확인해주세요.';

/**
 * 서버가 ApiResponse 본문을 주지 못했을 때(프록시 HTML 응답·본문 파싱 실패) 합성하는 폴백 문구.
 * 항상 truthy 라 `error.message ?? 기본문구` 로는 걸러지지 않으므로, 서버가 내려준 사용자 대면 사유와
 * 이 합성 문구를 구분해야 하는 호출처(MemberAccessGuard 등)가 비교에 쓴다.
 */
export const httpFallbackMessage = (status: number) => `요청 실패 (${status})`;

export async function toApiError(error: unknown): Promise<never> {
  // connectivity fail-fast 등 이미 정규화된 에러는 그대로 통과시킨다.
  if (error instanceof ApiError) {
    throw error;
  }
  // ky 타임아웃 — 분류별 REQUEST_TIMEOUT_MS 초과. 재시도 정책(shouldRetryQuery)이 code 로 식별한다.
  if (error instanceof TimeoutError) {
    throw new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT');
  }
  if (error instanceof HTTPError) {
    let message = httpFallbackMessage(error.response.status);
    let payload: unknown;
    let code: string | undefined;
    try {
      const body = (await error.response.json()) as ApiResponse<unknown>;
      if (body && typeof body.message === 'string') {
        message = body.message;
      }
      if (body && typeof body.code === 'string') {
        code = body.code;
      }
      payload = body.data;
    } catch {
      // ignore json parse failure
    }
    throw new ApiError(error.response.status, message, payload, code);
  }
  // fetch 네트워크 실패(오프라인·DNS·연결 거부)는 TypeError 로 도착한다.
  if (error instanceof TypeError) {
    throw new ApiError(0, NETWORK_ERROR_MESSAGE, undefined, 'NETWORK');
  }
  throw error;
}

export function unwrap<T>(response: ApiResponse<T>): T {
  // 200 + null 봉투(res.json() 이 null)면 response 자체가 null 로 도착한다 — 이때 response.ok 접근이
  // TypeError 를 던져 toApiError 가 NETWORK 로 오분류하므로, 먼저 null 봉투를 빈 응답으로 가드한다.
  if (!response || !response.ok || response.data === null) {
    throw new ApiError(0, response?.message ?? '응답이 비어 있습니다.');
  }
  return response.data;
}

/**
 * `data: null` 을 오류가 아닌 유효한 결과로 취급하는 조회 전용 언래퍼.
 * unwrap 은 null 을 빈 응답(ApiError)으로 던지므로, "없음도 정상 응답"이 계약인 엔드포인트
 * (예: 비멤버일 때 200 + null 인 멤버십 조회)만 이쪽을 쓴다.
 */
export function unwrapNullable<T>(response: ApiResponse<T | null>): T | null {
  // 봉투 자체가 없는 경우(본문이 통째로 빈 응답)는 서버가 명시적으로 내린 data: null 과 다르다 —
  // unwrap 과 동일하게 오류로 처리한다.
  if (!response || !response.ok) {
    throw new ApiError(0, response?.message ?? '응답이 비어 있습니다.');
  }
  return response.data ?? null;
}

// 본문 소비 타임아웃(ms). ky 의 timeout 은 응답 헤더 도착까지만 계측하므로,
// 헤더 후 본문이 중단(stall)되면 json()/blob() 이 무한 대기한다 — 별도 상한으로 막는다.
export const JSON_BODY_READ_TIMEOUT_MS = 10_000;
export const BLOB_BODY_READ_TIMEOUT_MS = 60_000;

// 테스트를 위해 export. 타임아웃 시 정규화된 TIMEOUT ApiError 로 거부한다.
export async function readBodyWithTimeout<T>(bodyPromise: Promise<T>, timeoutMs: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new ApiError(0, TIMEOUT_ERROR_MESSAGE, undefined, 'TIMEOUT')),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([bodyPromise, timeoutPromise]);
  } finally {
    clearTimeout(timerId);
  }
}

// 요청 분류별 클라이언트 타임아웃(ms). 모든 요청은 ky 전역 기본값(default)을 받고,
// 분류가 다른 엔드포인트만 개별 오버라이드한다.
// (스펙: docs/superpowers/specs/2026-07-12-network-resilience-design.md §3.1)
export const REQUEST_TIMEOUT_MS = {
  /** 전역 기본 — 일반 조회·변경 */
  default: 10_000,
  /** 로그인 — 대기 체감이 가장 민감한 경로 */
  login: 5_000,
  /** 가입·MO 인증·비밀번호 재설정·번호 변경 — 인증사 경유 가능성이 있어 로그인보다 여유 */
  authFlow: 8_000,
  /** 사용자가 타이핑 후 결과를 기다리는 검색성 목록 */
  search: 8_000,
  /** 파일 업로드 — 느린 회선에서도 전송이 완료되도록 넉넉히 */
  upload: 60_000,
  /** 로그아웃의 서버 폐기는 best-effort — 백엔드가 행이어도 로컬 로그아웃이 오래 묶이지 않게 짧게 */
  logoutRevoke: 5_000,
  /** 거래 동기화 — 백엔드가 외부 은행 API(connect 5s + read 15s)를 기다린다 */
  bankSync: 30_000,
  /** 시설 이용현황·가용성 — 백엔드가 요청 스레드에서 학교 서버 온디맨드 재크롤 후 응답할 수 있다.
   *  BE 최악 응답시간 ≈ 16.5s(첫 룸은 데드라인 예외 — 2회 시도 × (connect 3s + read 5s) + 백오프 0.5s)라
   *  default 10s 로는 stale-serving 응답이 도착하기 전에 끊긴다(2026-07-17 감사). */
  facilityOnDemand: 18_000,
} as const;

export function cleanParams<T extends object>(params: T | undefined): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (!params) return searchParams;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    // 배열은 같은 키를 여러 번 append 해 Spring `@RequestParam List<T>` 와 호환되게 한다.
    // (e.g. tags=[a,b] → ?tags=a&tags=b)
    if (Array.isArray(value)) {
      for (const element of value) {
        if (element === undefined || element === null || element === '') continue;
        searchParams.append(key, String(element));
      }
      continue;
    }
    searchParams.append(key, String(value));
  }
  return searchParams;
}
