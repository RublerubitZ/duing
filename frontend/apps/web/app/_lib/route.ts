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
  // 브라우저 URL 파서는 파싱 전에 탭(\t)·개행(\n)·CR(\r)을 문자열 어디서든 제거한다. 이를 끼워 넣은
  // `/\t/host`·`/\n//host` 는 `//host` 로 정규화돼 오프-오리진으로 빠지므로, 이 문자가 섞인 값은
  // 프리픽스 검사 전에 내부 경로로 인정하지 않는다(open redirect 우회 차단).
  if (/[\t\n\r]/.test(url)) return null;
  if (!url.startsWith('/')) return null;
  // 프로토콜 상대경로(//host)·역슬래시(/\\host)는 브라우저가 오프-오리진으로 해석하므로 내부 경로로 취급하지 않는다.
  if (url.startsWith('//') || url.startsWith('/\\')) return null;
  return url as Route;
}

// 세그먼트 프리페치 경로 `<page>.segments/<segment>.segment[.rsc]` — Next 정규화기와 같은 모양만 인정하고
// 마지막 `.segments/` 기준으로 자른다. s 플래그: 줄 구분자(U+2028·U+2029)가 끼어도 끝까지 본다.
const TRANSPORT_SEGMENT = /^(.*)\.segments\/.*\.segment(?:\.rsc)?$/s;
// 그 밖의 접미 — Next 전송 형태 `.rsc` 와, Next 16 이 만들지 않지만 조작된 링크 대비로 함께 떼는 `.prefetch`·`.json`
// (아래 JSDoc 참고). 겹쳐 붙어도 한 번에 떼어 결과가 멱등이 된다.
const TRANSPORT_SUFFIX = /(?:\.(?:prefetch|rsc|json))+$/;

/**
 * 로그인·가입 뒤 복귀 경로(`?next=`) 전용. toLinkRoute 의 open redirect 검사를 통과한 값에서 경로 접미를 떼어
 * 실제 페이지 경로만 남긴다. 세그먼트 프리페치(`.segments/…`)와 `.rsc` 는 Next 의 전송 형태이고, `.prefetch`·`.json` 은
 * Next 16 이 만들지 않지만 조작된 링크의 복귀 경로를 실제 페이지로 돌려놓으려고 함께 뗀다(복귀 경로에서는 더 떼어도
 * 무해 — 미들웨어의 형식 판정은 이들을 404 로 본다). 미들웨어는 요청 경로를 그대로 next 에 담으므로 전송 경로로 들어온
 * 요청(조작된 링크 포함)이 복귀 경로가 되면 로그인 뒤 404 가 난다. next 를 만드는 곳은 여럿이지만 소비하는
 * 곳은 로그인·가입 화면 두 곳이라 여기서 한 번에 막는다. 세그먼트 접미는 Next 정규화기가 인정하는
 * `<page>.segments/<segment>.segment[.rsc]` 모양일 때만 마지막 `.segments/` 기준으로 자른다. Next 가 만드는
 * 전송 경로에 대해서는 한 번 더 적용해도 결과가 같아(멱등) 가입↔로그인 왕복으로 여러 번 거쳐도 경로가 더 줄지 않는다.
 */
export function toReturnRoute(url: string | null): Route | null {
  const route = toLinkRoute(url);
  if (!route) return null;
  const splitAt = route.search(/[?#]/);
  const path = splitAt === -1 ? route : route.slice(0, splitAt);
  const rest = splitAt === -1 ? '' : route.slice(splitAt);
  const pagePath = path.replace(TRANSPORT_SEGMENT, '$1').replace(TRANSPORT_SUFFIX, '');
  // 루트(/)의 전송 경로는 `/index.*` 로 만들어진다 — `/index` 는 이 앱에 없는 라우트라 `/` 로 접는다.
  // 결과를 toLinkRoute 로 다시 검사해 open redirect 불변식을 위 치환 규칙에 기대지 않는다(as 단언도 없앤다).
  return toLinkRoute(`${pagePath === '/index' ? '/' : pagePath}${rest}`);
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
