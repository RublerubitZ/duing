import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

// 학생 PII(이름·학번·이메일·전화)는 관리자 검색 등에서 URL 쿼리스트링으로 전달되므로,
// Sentry 전송 직전 요청 URL·브레드크럼 URL 의 쿼리스트링을 제거한다(백엔드 beforeSend 와 동일 정책).
// PostHog 도 같은 정책을 쓴다(instrumentation-client 의 sanitize_properties) — 판정을 한 곳에 둔다.
export function stripQuery(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

// 요청 헤더 중 자격 증명·위치로 보이는 이름 — 값을 가린다. Sentry SDK 가 헤더 값 가림을 span 속성에만 적용하는
// 민감 키 목록(SENSITIVE_KEY_SNIPPETS)과 같은 기준에, 서명·배포 보호 우회·재검증 비밀 헤더(signature·bypass·
// prerender-revalidate·sc-headers)와 IP 에서 파생한 위치 헤더(-ip: x-vercel-ip-city 등)를 더했다.
// 이름 일부만 맞아도 가린다.
const SENSITIVE_HEADER_NAME =
  /auth|cookie|token|secret|session|passw|pwd|key|jwt|bearer|sso|saml|csrf|xsrf|credential|sid|identity|signature|bypass|prerender-revalidate|sc-headers|-ip/i;

// 이벤트 전송 직전 요청 URL/쿼리스트링에서 PII 를 제거하고, 요청 본문·쿠키·자격 증명 헤더 값을 지운다.
// sendDefaultPii:false 여도 SDK(10.x)는 서버 오류 이벤트(onRequestError)에 요청 헤더와 파싱한 쿠키를 그대로
// 싣는다(IP 헤더만 제거) — 로그인 쿠키(JWT)·내부 재검증 경로의 Bearer 비밀값이 Sentry 로 나가지 않게 한다.
// SDK 의 dataCollection 옵션으로 고치지 않는다: 키를 하나라도 주면 나머지 기본값이 전부 허용으로 바뀐다.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (typeof event.request.url === 'string') {
      event.request.url = stripQuery(event.request.url);
    }
    event.request.query_string = undefined;
    event.request.cookies = undefined;
    event.request.data = undefined;
    const headers = event.request.headers;
    if (headers) {
      for (const name of Object.keys(headers)) {
        const value = headers[name];
        if (SENSITIVE_HEADER_NAME.test(name)) {
          headers[name] = '[Filtered]';
        } else if (name.toLowerCase() === 'referer' && typeof value === 'string') {
          // 같은 출처 이동의 Referer 는 이전 주소의 쿼리스트링(관리자 검색어 등)을 그대로 담는다.
          headers[name] = stripQuery(value);
        }
      }
    }
  }
  // onRequestError 는 요청 경로를 contexts.nextjs.request_path 에도 싣는다(쿼리스트링 포함).
  const nextjsContext = event.contexts?.nextjs;
  if (typeof nextjsContext?.request_path === 'string') {
    nextjsContext.request_path = stripQuery(nextjsContext.request_path);
  }
  return event;
}

// 클릭·입력 브레드크럼(ui.click·ui.input)의 문구는 SDK 가 만든 요소 셀렉터다 — 대상과 조상(최대 4단계, 80자 안)을
// ' > ' 로 잇고, 요소마다 태그·id·클래스 뒤에 aria-label·type·name·title·alt 값을 `[이름="값"]` 으로 붙인다
// (@sentry/browser-utils 의 htmlTreeAsString, 값 안의 따옴표는 이스케이프하지 않는다). 목록의 체크박스·버튼은 접근성을
// 위해 `aria-label="홍길동 선택"`, `title="… 님을 …"` 처럼 사람 이름을 속성에 담으므로, 속성 이름을 고르지 않고 값을
// 전부 가린다 — PostHog 의 mask_all_element_attributes 와 같은 원칙(개별 속성을 열거하면 새 화면에서 뚫린다).
const SELECTOR_ATTRIBUTE_VALUE = /\[([\w-]+)="[^"]*"\]/g;
// SDK 가 값을 붙이는 속성 꼴. 가린 뒤에도 이 꼴이 남으면 형식이 바뀌어(작은따옴표·따옴표 없음) 위 패턴이 빗나간 것이다.
// Sentry SDK 를 올릴 때 htmlTreeAsString 의 형식과 속성 목록이 그대로인지 다시 확인한다.
const SDK_SERIALIZED_ATTRIBUTE = /\[(?:aria-label|type|name|title|alt)=/;

function maskSelectorAttributeValues(selector: string): string {
  const masked = selector.replace(SELECTOR_ATTRIBUTE_VALUE, '[$1="[Filtered]"]');
  // 가린 블록을 뺀 나머지에 큰따옴표(값 경계가 깨짐)나 SDK 속성 꼴(형식 변경)이 남으면 문구 전체를 가린다.
  // 한계: 짝이 맞는 `"]…[x="` 를 일부러 넣은 값은 그 일부가 남을 수 있다 — 그 값을 쓴 본인의 문자열뿐이다.
  const unmaskedRest = masked.replaceAll('="[Filtered]"]', '');
  return unmaskedRest.includes('"') || SDK_SERIALIZED_ATTRIBUTE.test(unmaskedRest) ? '[Filtered]' : masked;
}

// fetch/xhr/navigation 브레드크럼의 URL 쿼리스트링을 제거하고, 클릭·입력 브레드크럼의 요소 속성 값을 가린다
// (에러 이벤트에 함께 실리는 PII 차단). 서버 http 브레드크럼(외부 호출)은 URL 의 쿼리를 이미 떼지만 http.query 에
// 키 필터만 거친 쿼리를 따로 남긴다(서버 SDK — node:http·fetch 공통) — SDK 는 민감 키 이름만 가려 값이 그대로
// 남으므로 그 키와 프래그먼트도 지운다.
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  // 클릭 브레드크럼은 보통 data 가 없다 — 아래 data 조기 반환보다 먼저 처리한다.
  if (breadcrumb.category?.startsWith('ui.') && typeof breadcrumb.message === 'string') {
    breadcrumb.message = maskSelectorAttributeValues(breadcrumb.message);
  }
  const data = breadcrumb.data;
  if (!data) {
    return breadcrumb;
  }
  if (
    (breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr' || breadcrumb.category === 'http') &&
    typeof data.url === 'string'
  ) {
    data.url = stripQuery(data.url);
  }
  if (breadcrumb.category === 'http') {
    delete data['http.query'];
    delete data['http.fragment'];
  }
  if (breadcrumb.category === 'navigation') {
    if (typeof data.from === 'string') {
      data.from = stripQuery(data.from);
    }
    if (typeof data.to === 'string') {
      data.to = stripQuery(data.to);
    }
  }
  return breadcrumb;
}
