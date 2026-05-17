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
