import * as Sentry from '@sentry/nextjs';

import { scrubBreadcrumb, scrubEvent, stripQuery } from './sentry-scrub';

// 클라이언트(브라우저) 런타임 Sentry 초기화. NEXT_PUBLIC_SENTRY_DSN 이 비면 자동 비활성.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? 'local',
  // 에러 모니터링만 — 성능 추적 비활성.
  // 세션 리플레이는 학생 PII(이름·학번·이메일)가 담긴 화면을 그대로 캡처하므로 절대 추가하지 않는다.
  tracesSampleRate: 0,
  // 요청/사용자 PII 자동 첨부 차단(개인정보 보호).
  sendDefaultPii: false,
  // next-view-transitions(View Transitions API)가 내는 무해한 unhandled rejection 2종 —
  // invalid state(백그라운드 탭·bfcache 복원·중단된 연속 이동, Sentry NEXT-DUING-4)와
  // timeout(라우트 전환 중 DOM 업데이트가 브라우저 제한 약 4초를 넘김, Sentry NEXT-DUING-9).
  // timeout 은 동적 라우트 loading.tsx 배치(2026-07 네트워크 내성 작업, PR-B)로 정상 회선의
  // 발생 경로는 해소됐고, 완전 오프라인·극단 저속 회선의 잔존 케이스만 남아 가드를 유지한다.
  // 둘 다 페이지 이동은 정상이고 시각 전환만 스킵되며 사용자 영향 0 → 운영 노이즈만 끈다.
  // 이 두 메시지에만 최소 범위로 매칭하고, 다른 InvalidStateError/TimeoutError 는 그대로 수집한다.
  ignoreErrors: [
    'Transition was aborted because of invalid state',
    'Transition was aborted because of timeout in DOM update',
  ],
  // 요청 URL·브레드크럼(fetch/xhr/navigation)의 쿼리스트링 PII 제거.
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});

// 위 ignoreErrors 는 Sentry 전송만 거를 뿐 브라우저 콘솔의 "Uncaught (in promise)" 노이즈는 남는다.
// next-view-transitions(0.3.5 가 최신)가 잡지 않고 흘리는 View Transition abort rejection 에만
// 기본 동작(콘솔 출력)을 막는다 — preventDefault 는 다른 리스너(Sentry 포함)에 영향이 없고,
// 조건 밖의 모든 rejection 은 평소처럼 노출된다.
window.addEventListener('unhandledrejection', (event) => {
  const reason: unknown = event.reason;
  const isViewTransitionAbort =
    reason instanceof DOMException &&
    (reason.name === 'InvalidStateError' || reason.name === 'TimeoutError') &&
    reason.message.includes('Transition was aborted');
  if (isViewTransitionAbort) event.preventDefault();
});

// App Router 네비게이션 계측 훅(추적 비활성 시 no-op).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// PostHog 클라이언트 초기화 — Sentry 아래 별도로 둔다.
import posthog from 'posthog-js';
import type { CaptureResult } from 'posthog-js';

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// URL 을 담는 속성 이름 — 키로 고르면 SDK 가 URL 속성을 새로 추가해도 자동으로 덮인다.
// ($current_url · $referrer · $initial_current_url · $session_entry_url · $external_click_url …)
const URL_BEARING_PROPERTY = /url|referrer/i;
// autocapture 는 클릭한 요소의 링크 주소를 직렬화된 요소 사슬 안에 넣는다 — 속성 이름 기준으로는 안 걸린다.
// 값 안의 따옴표는 SDK 가 역슬래시로 이스케이프하므로 그 짝을 함께 읽어야 값 경계를 놓치지 않는다.
const HREF_ATTRIBUTE = /href="((?:\\.|[^"\\])*)"/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * PostHog 로 나가는 속성에서 URL 쿼리스트링을 제거한다.
 *
 * <p>관리자 콘솔의 검색어는 주소에 실린다 — 지원자 관리 검색창 안내가 "이름·학번·학과로 검색"이라
 * 운영진이 이름을 타이핑하면 주소가 `?q=<이름>` 이 된다. 그대로 두면 "누가 누구를 검색했는지"가
 * 이름·학번 단위로 분석 도구에 쌓이고, 한 번 전송된 것은 회수할 수 없다.
 *
 * <p>새는 경로는 두 가지다. 현재 주소는 페이지뷰뿐 아니라 <b>모든 이벤트</b>에 붙으므로 검색 상태에서
 * 클릭 한 번이면 나가고, 목록에서 상세로 들어갈 때는 검색 조건을 그대로 물고 가 페이지뷰에 실린다.
 * (경로가 그대로면 페이지뷰는 발화하지 않으므로 "타이핑할 때마다 전송"은 아니다.)
 *
 * <p>Sentry 는 같은 이유로 이미 쿼리스트링을 지운다 — 판정을 sentry-scrub 한 곳에 두고 공유한다.
 *
 * <p>범위 한계: 최상위 문자열 속성과 요소 사슬의 링크 주소만 본다. 중첩 객체 안의 주소(성능 지표
 * 상세 등)와 이 훅을 타지 않는 전송 경로(기능 플래그 요청)는 덮지 못하므로, 그런 채널은 수집 자체를
 * 끄거나 SDK 단계 마스킹으로 막는다 — 위 초기화 옵션이 그 역할이다.
 */
function stripUrlQueryFromProperties(properties: Record<string, unknown>): void {
  for (const [propertyName, propertyValue] of Object.entries(properties)) {
    if (typeof propertyValue === 'string' && URL_BEARING_PROPERTY.test(propertyName)) {
      properties[propertyName] = stripQuery(propertyValue);
    }
  }

  // 요소 사슬의 링크 주소. SDK 가 이 값만은 속성 필터·마스킹 뒤에 무조건 다시 넣어서
  // (autocapture 의 attr__href 재할당) 전송 직전인 여기서 지우는 수밖에 없다.
  const elementsChain = properties.$elements_chain;
  if (typeof elementsChain === 'string') {
    properties.$elements_chain = elementsChain.replace(
      HREF_ATTRIBUTE,
      (_matched, href: string) => `href="${stripQuery(href)}"`,
    );
  }
  const elements = properties.$elements;
  if (Array.isArray(elements)) {
    for (const element of elements) {
      if (isRecord(element) && typeof element.attr__href === 'string') {
        element.attr__href = stripQuery(element.attr__href);
      }
    }
  }
}

/**
 * 전송 직전 한 번에 정제한다. 이벤트 속성뿐 아니라 사람 속성($set·$set_once)까지 같은 함수가 덮는다 —
 * 속성만 거르는 훅은 사람 속성 경로를 구조적으로 못 덮고, SDK 도 그 훅을 폐기 예정으로 표시했다.
 */
function scrubAnalyticsEvent(captureResult: CaptureResult | null): CaptureResult | null {
  if (!captureResult) {
    return captureResult;
  }
  stripUrlQueryFromProperties(captureResult.properties);
  if (captureResult.$set) {
    stripUrlQueryFromProperties(captureResult.$set);
  }
  if (captureResult.$set_once) {
    stripUrlQueryFromProperties(captureResult.$set_once);
  }
  return captureResult;
}

if (!posthogKey) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(
      'NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, ' +
        'this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured',
    );
  }
} else {
  posthog.init(posthogKey, {
    api_host: '/ingest',
    ui_host: 'https://us.posthog.com',
    defaults: '2026-01-30',
    // 예외 모니터링은 Sentry 전담(소스맵 업로드까지 구축) — 중복 캡처와 예외 메시지 경유 PII 유입을 막는다.
    capture_exceptions: false,
    // 세션 리코딩 금지 — 위 Sentry 세션 리플레이와 같은 이유다. 입력 필드만 가려지고 화면에 렌더된
    // 텍스트(조회된 원본 전화번호·지원자 연락처·이름/학번/학과)는 그대로 녹화돼, 조회마다 감사 기록을
    // 남기도록 만든 통제를 통째로 우회한다.
    // 이 플래그는 대시보드 토글과 AND 로 묶인다(SDK: server_side_enabled && !disable_session_recording).
    // 원격으로 켜도 배포된 코드가 이 값을 들고 있는 한 레코더 스크립트조차 내려받지 않는다.
    disable_session_recording: true,
    // 히트맵 금지 — 세션 리코딩과 같은 이유이자 같은 구조다. 켜지면 클릭 좌표를 모으면서
    // 쿼리스트링이 붙은 전체 주소를 버퍼의 키로 싣는데, 그 값은 아래 정제가 닿지 않는 모양이다.
    // 활성 여부가 코드에 없으면 대시보드에서 배포 없이 켤 수 있으므로 여기서 못박는다.
    capture_heatmaps: false,
    // 자동 수집이 클릭한 요소의 텍스트를 싣는 것을 막는다. 지원자·회원 목록은 이름·학번이 보이는
    // 행 자체가 클릭 대상이고(커서 모양이 상속돼 셀까지 수집 대상이 된다), SDK 내장 필터는
    // 해외 식별자 형식만 걸러 한글 이름·학번은 하나도 잡지 못한다.
    mask_all_text: true,
    // 속성도 함께 막는다. 텍스트만 끄면 채널이 옮겨갈 뿐이다 — 목록의 체크박스·버튼은 접근성을 위해
    // `aria-label="홍길동 선택"`, `title="… 님을 …"` 처럼 이름을 속성에 담고, 그 값은 요소 사슬에
    // attr__* 로 그대로 실린다. 개별 속성을 열거해 막으면 새 화면이 생길 때마다 뚫리므로 전부 끈다.
    //
    // 대가: 위 둘을 끄면 자동 수집 이벤트에 사람이 읽을 수 있는 식별자가 남지 않는다(태그·클래스·순번뿐).
    // "특정 문구 버튼 클릭" 기준의 퍼널·툴바 지정은 불가능해진다. 되살려야 하면 전면 해제가 아니라
    // 안전한 라벨을 명시하는 방식(data-ph-capture-attribute-*)으로 가야 한다 — 그 경로는 마스킹 밖이다.
    mask_all_element_attributes: true,
    // 죽은 클릭 수집 금지 — 히트맵과 같은 원격 토글 구조이고, 켜지면 위 자동 수집 속성이
    // 같은 모양으로 한 번 더 실린다.
    capture_dead_clicks: false,
    // 설문 스크립트 로드 금지 — 대시보드 토글과 AND 로 묶이지 않는 유일한 예외라 여기서 못박는다.
    // 원격 설정이 surveys:false 여도 SDK 는 그 값을 '비활성 확정'으로 저장한 뒤 그대로
    // loadExternalDependency('surveys') 를 타서 /ingest/static/surveys.js(디코드 약 100KB)를 매 문서
    // 로드마다 내려받고 실행한다(posthog-js 1.407.2 lib/src/posthog-surveys.js 의 loadIfEnabled 가
    // undefined 일 때만 조기 반환하고 false 는 통과시킨다). 이 플래그만이 그 경로 자체를 막는다.
    // 절감 대상은 Vercel Active CPU 가 아니다 — /ingest 는 외부 rewrite 라 함수를 깨우지 않는다.
    // 줄어드는 것은 Edge Request 1건/문서 로드와 브라우저 다운로드·파싱 비용이다.
    // 설문 기능을 실제로 쓰기로 하면 이 줄을 지우고 재배포해야 한다(원격 토글만으로는 안 뜬다).
    disable_surveys: true,
    // 최초 방문 주소는 이벤트가 아니라 저장소에 굳어 기능 플래그 요청 본문으로도 나가는데,
    // 그 경로는 아래 전송 직전 훅을 타지 않는다. 검색어 파라미터를 SDK 단계에서 가려 그 창을 막는다.
    // (근본 해법은 주소에 검색어를 싣지 않는 것 — 총동연 회원 관리는 이미 그렇게 되어 있다.)
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['q'],
    // 주소에 실린 검색어(관리자 콘솔의 이름·학번)가 전송되는 것을 막는다.
    // 이 줄이 사라지면 학생 PII 가 분석 도구에 축적되고 회수할 수 없다.
    before_send: scrubAnalyticsEvent,
    debug: process.env.NODE_ENV === 'development',
  });
}
