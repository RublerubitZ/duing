import type { ErrorEvent } from '@sentry/nextjs';

// 운영 번들의 React 는 하이드레이션 오류를 축약 코드로 던진다. Next 는 이 오류를 onRecoverableError → window.reportError 로
// 넘기고, Sentry 전역 핸들러(onerror)가 받아 보낸다. Sentry 서버의 하이드레이션 Inbound Filter 와 같은 묶음에, 그 필터가
// 빠뜨린 424(하이드레이션 중 루트가 바뀌어 전체를 클라이언트 렌더링으로 전환)를 더했다. React 19 번들에서 그대로 보고되는 것은
// 418·419·424 이고, 422·423 은 cause 로 감싸져 Next 가 원인 오류를 대신 보고한다.
const HYDRATION_ERROR = /Minified React error #(418|419|421|422|423|424|425)\b/;
// 정적 세그먼트는 모두 소문자·숫자·하이픈이다(/403 포함). 그 밖의 세그먼트(한글·대문자·점이 든 잘못된 ID·스캐너 경로)는
// 한 키로 묶는다 — 소문자로 된 임의 404 경로는 그대로 남는다(정적 목록을 두면 새 페이지가 한 키로 뭉친다).
const STATIC_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const NUMERIC_SEGMENT = /^\d+$/;
const REPORTED_KEY_PREFIX = 'duing:sentry-hydration:';

// 이벤트에는 경로 템플릿이 없다 — 추적을 번들에서 뺐기 때문(next.config.mjs 의 __SENTRY_TRACING__)에 transaction 이 비고
// request.url 에 실제 주소만 실린다.
function toPageKey(url: string | undefined): string {
  if (!url) return 'unknown';
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return 'unknown';
  }
  const segmentKeys = pathname
    .split('/')
    .filter(Boolean)
    .map((segment, index, segments) => {
      // 초대 코드는 크록포드 6자라 숫자만이거나 소문자로 입력될 수 있다 — 숫자·정적 판정보다 먼저 묶는다.
      if (index === 1 && segments[0] === 'join') return ':code';
      // 앱의 동적 세그먼트는 초대 코드를 빼면 모두 상위 세그먼트 아래의 숫자 ID 다.
      if (index > 0 && NUMERIC_SEGMENT.test(segment)) return ':id';
      return STATIC_SEGMENT.test(segment) ? segment : ':param';
    });
  return `/${segmentKeys.join('/')}`;
}

/**
 * 하이드레이션 오류를 페이지·코드별 이슈로 나누고, 같은 탭에서는 페이지·코드마다 한 번만 보낸다.
 *
 * <p>프레임이 전부 React 내부 청크라 기본 그룹핑으로는 모든 페이지의 오류가 한 이슈로 뭉친다 — 새 페이지에서 회귀가
 * 생겨도 새 이슈가 열리지 않는다. 페이지 키를 transaction 에도 넣어 이슈 목록에서 어느 페이지인지 보이게 한다.
 *
 * <p>하이드레이션은 문서를 받을 때만 일어나므로, 1회 제한이 줄이는 것은 같은 탭의 새로고침·재방문뿐이다. 사이트 전체
 * 회귀의 상한은 아니다(탭마다 1건씩 온다).
 */
export function fingerprintAndDedupeHydrationError(event: ErrorEvent): ErrorEvent | null {
  const errorCode = event.exception?.values
    ?.map((exception) => exception.value?.match(HYDRATION_ERROR)?.[1])
    .find((code) => code !== undefined);
  if (!errorCode) return event;

  const pageKey = toPageKey(event.request?.url);
  event.fingerprint = ['react-hydration-error', `#${errorCode}`, pageKey];
  event.transaction = pageKey;
  // 키를 먼저 쓴다 — 이 뒤 단계(전송 레이트 리밋·네트워크 실패, 나중에 넣을 수 있는 sampleRate)에서 이벤트가 버려지면
  // 그 탭에서는 1건이 빠진다. 다른 탭·사용자는 계속 보고하므로 받아들인다.
  const reportedKey = `${REPORTED_KEY_PREFIX}${errorCode}:${pageKey}`;
  try {
    if (window.sessionStorage.getItem(reportedKey) !== null) return null;
    window.sessionStorage.setItem(reportedKey, '1');
  } catch {
    // 저장소를 못 쓰면 제한 없이 보낸다 — 버리는 것보다 보고가 낫다.
  }
  return event;
}
