import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

// 학생 PII(이름·학번·이메일·전화)는 관리자 검색 등에서 URL 쿼리스트링으로 전달되므로,
// Sentry 전송 직전 요청 URL·브레드크럼 URL 의 쿼리스트링을 제거한다(백엔드 beforeSend 와 동일 정책).
// PostHog 도 같은 정책을 쓴다(instrumentation-client 의 sanitize_properties) — 판정을 한 곳에 둔다.
export function stripQuery(url: string): string {
  const queryIndex = url.indexOf('?');
  return queryIndex === -1 ? url : url.slice(0, queryIndex);
}

// 이벤트 전송 직전 요청 URL/쿼리스트링에서 PII 를 제거한다.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    if (typeof event.request.url === 'string') {
      event.request.url = stripQuery(event.request.url);
    }
    event.request.query_string = undefined;
  }
  return event;
}

// fetch/xhr/navigation 브레드크럼의 URL 쿼리스트링을 제거한다(에러 이벤트에 함께 실리는 PII 차단).
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (!data) {
    return breadcrumb;
  }
  if ((breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') && typeof data.url === 'string') {
    data.url = stripQuery(data.url);
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
