import type { Route } from 'next';

/**
 * Next typedRoutes 와의 인터페이스를 한 곳에 격리하는 헬퍼.
 *
 * typedRoutes 는 컴파일 타임 literal 만 허용하지만 런타임 동적 경로
 * (`/apply/${id}`, `searchParams.get('next')`) 는 string 으로만 표현된다.
 * 본 헬퍼는 그 변환을 한 곳에 격리하고 호출 측에서는 `router.push(toRoute(path))` 로만 사용.
 *
 * 파라미터 타입을 template literal `/${string}` 으로 좁혀 호출자가 슬래시 없는
 * 잘못된 경로를 넘기는 것을 컴파일 타임에 차단한다. `as Route` 단언은 본 파일에만
 * 격리되며 그 외 코드에서는 사용 금지 (CLAUDE.md 의 'as 금지' 규칙).
 */
export function toRoute(path: `/${string}`): Route {
  return path as Route;
}

/**
 * 백엔드에서 오는 동적 linkUrl(string | null)을 Route 로 변환.
 * 슬래시로 시작하는 경우에만 Route 로 취급하고, 아닌 경우 null 을 반환해
 * 호출 측이 타입 안전하게 처리하도록 한다.
 */
export function toLinkRoute(url: string | null): Route | null {
  if (!url) return null;
  if (!url.startsWith('/')) return null;
  return url as Route;
}

/**
 * 백엔드/사용자 입력 URL 을 외부 링크 anchor(href)로 안전하게 변환한다.
 * http(s) 스킴만 허용하고, javascript:/data:/vbscript: 등 스크립트 실행이 가능한
 * 값이나 내부 상대경로는 null 을 반환해 호출 측이 비-링크로 렌더하도록 한다.
 *
 * 안전성의 보장은 `^https?://` allowlist 자체다. 검사 전에 공백류 문자를 제거하는 것은
 * 브라우저가 URL 파싱 시 무시하는 공백·개행을 끼워 넣은 우회(`java\tscript:`)를
 * http 가 아닌 것으로 확실히 떨어뜨리고, 선행 공백이 붙은 정상 URL 의 오탐을 줄이기 위함이다.
 * (저장형 XSS 차단)
 */
export function safeExternalHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const normalized = url.replace(/\s/g, '');
  return /^https?:\/\//i.test(normalized) ? url : null;
}
