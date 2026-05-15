import type { Route } from 'next';

/**
 * 동적 string 을 Next typedRoutes 의 `Route` 로 격리해서 변환하는 헬퍼.
 *
 * typedRoutes 는 컴파일 타임 literal 만 허용하지만, 런타임에 만들어지는
 * 경로(예: `/apply/${id}`, `searchParams.get('next')`) 는 string 으로만 표현된다.
 * `as Route` 단언을 코드 전반에 흩어두는 대신 이 헬퍼 한 곳에 격리해서
 * 호출부에서는 `router.push(toRoute(path))` 형태로 사용한다.
 *
 * path 는 반드시 `/` 로 시작해야 하며, 그 외 형식은 거부한다.
 */
export function toRoute(path: string): Route {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    throw new Error(`[toRoute] invalid path: ${path}`);
  }
  return path as Route;
}
