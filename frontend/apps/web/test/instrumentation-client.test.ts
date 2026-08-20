import type { CaptureResult, PostHogConfig } from 'posthog-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

// instrumentation-client 는 import 시점에 Sentry.init 을 호출한다 — 테스트에서 실제 전송이 붙지 않도록 막는다.
vi.mock('@sentry/nextjs', () => ({
  init: vi.fn(),
  captureRouterTransitionStart: vi.fn(),
}));

/**
 * instrumentation-client 를 새로 평가해 posthog.init 에 넘어간 옵션을 돌려준다.
 * 모듈 캐시를 먼저 비운 뒤 posthog-js 를 가져와야 계측 대상과 같은 인스턴스에 스파이가 걸린다.
 */
async function captureInitOptions(): Promise<Partial<PostHogConfig>> {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');

  const posthog = (await import('posthog-js')).default;
  const initSpy = vi.spyOn(posthog, 'init').mockImplementation(() => posthog);

  await import('@/instrumentation-client');

  expect(initSpy).toHaveBeenCalledTimes(1);
  // noUncheckedIndexedAccess 가 켜져 있어 인덱싱 결과는 undefined 를 포함한다 — 옵셔널 체이닝 후 가드한다.
  const options = initSpy.mock.calls[0]?.[1];
  if (!options) throw new Error('posthog.init 은 옵션과 함께 호출되어야 한다');
  return options;
}

/** 전송 직전 훅을 실제로 태운다. 훅이 통째로 빠지면 여기서 바로 드러난다. */
async function sendThroughScrubber(captureResult: CaptureResult): Promise<CaptureResult> {
  const options = await captureInitOptions();
  expect(options.before_send).toBeTypeOf('function');
  if (typeof options.before_send !== 'function') throw new Error('before_send 가 배선되어야 한다');
  const scrubbed = options.before_send(captureResult);
  if (!scrubbed) throw new Error('정제는 이벤트를 버리지 않는다');
  return scrubbed;
}

function eventWith(properties: Record<string, unknown>): CaptureResult {
  return { uuid: 'test-uuid', event: '$pageview', properties };
}

describe('PostHog 초기화 개인정보 정책', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  // 세션 리코딩은 대시보드에서 배포 없이 원격으로 켤 수 있고, 켜지면 화면에 렌더된 텍스트
  // (조회된 원본 전화번호·지원자 연락처·이름/학번/학과)가 그대로 녹화된다.
  // SDK 의 시작 조건이 server_side_enabled && !disable_session_recording 이라, 이 플래그가
  // 코드에 박혀 있는 동안에는 대시보드를 켜도 녹화가 시작되지 않는다. 이 줄이 사라지면 실패해야 한다.
  it('세션 리코딩을 끈 상태로 초기화한다', async () => {
    const options = await captureInitOptions();
    expect(options.disable_session_recording).toBe(true);
  });

  // 히트맵도 같은 구조(원격 토글)이고, 켜지면 쿼리스트링이 붙은 전체 주소가 버퍼 키로 실린다.
  it('히트맵 수집을 끈 상태로 초기화한다', async () => {
    const options = await captureInitOptions();
    expect(options.capture_heatmaps).toBe(false);
  });

  // 지원자·회원 목록은 이름·학번이 보이는 행이 곧 클릭 대상이라, 자동 수집 텍스트가 켜져 있으면
  // 행 클릭마다 원본 이름·학번이 전송된다. 정제로는 못 막는 축이라 수집 자체를 끈다.
  it('자동 수집이 요소 텍스트를 싣지 않게 한다', async () => {
    const options = await captureInitOptions();
    expect(options.mask_all_text).toBe(true);
  });

  // 텍스트만 끄면 채널이 옮겨갈 뿐이다 — 목록의 체크박스·버튼은 접근성을 위해 이름을
  // aria-label·title 에 담고, 그 값은 요소 사슬에 attr__* 로 실린다.
  it('자동 수집이 요소 속성을 싣지 않게 한다', async () => {
    const options = await captureInitOptions();
    expect(options.mask_all_element_attributes).toBe(true);
  });

  // 히트맵과 같은 원격 토글 구조이고, 켜지면 자동 수집 속성이 같은 모양으로 한 번 더 실린다.
  it('죽은 클릭 수집을 끈 상태로 초기화한다', async () => {
    const options = await captureInitOptions();
    expect(options.capture_dead_clicks).toBe(false);
  });

  // 다른 프라이버시 플래그와 달리 이건 대시보드 토글과 AND 로 묶이지 않는다 — 원격 설정이 surveys:false
  // 여도 SDK 는 그대로 surveys.js(디코드 약 100KB)를 매 문서 로드마다 받아 실행한다. 이 줄이 사라지면
  // 꺼진 기능을 위해 요청·다운로드·파싱이 되살아난다.
  it('설문 스크립트를 내려받지 않는 상태로 초기화한다', async () => {
    const options = await captureInitOptions();
    expect(options.disable_surveys).toBe(true);
  });

  // 최초 방문 주소는 저장소에 굳어 기능 플래그 요청 본문으로도 나가는데 그 경로는 전송 직전 훅을
  // 타지 않는다 — 검색어 파라미터만은 SDK 단계에서 가려 그 창을 막는다.
  it('검색어 파라미터를 SDK 단계에서도 가린다', async () => {
    const options = await captureInitOptions();
    expect(options.mask_personal_data_properties).toBe(true);
    expect(options.custom_personal_data_properties).toContain('q');
  });

  // 예외는 Sentry 전담 — PostHog 로 중복 캡처되면 예외 메시지를 타고 PII 가 한 번 더 흘러간다.
  it('예외 캡처를 PostHog 에서 켜지 않는다', async () => {
    const options = await captureInitOptions();
    expect(options.capture_exceptions).toBe(false);
  });

  it('URL 속성의 쿼리스트링을 제거한 뒤 전송한다', async () => {
    const scrubbed = await sendThroughScrubber(
      eventWith({
        $current_url:
          'https://duings.com/manage/clubs/1/recruitments/2/applicants?q=홍길동&status=SUBMITTED',
        $referrer: 'https://duings.com/manage/clubs/1/recruitments/2/applicants?q=20241234',
        $pathname: '/manage/clubs/1/recruitments/2/applicants',
      }),
    );

    expect(scrubbed.properties).toMatchObject({
      $current_url: 'https://duings.com/manage/clubs/1/recruitments/2/applicants',
      $referrer: 'https://duings.com/manage/clubs/1/recruitments/2/applicants',
      $pathname: '/manage/clubs/1/recruitments/2/applicants',
    });
  });

  // 자동 수집은 클릭한 링크의 주소를 요소 사슬 안에 넣는다 — 속성 이름 기준으로는 안 걸리는 자리다.
  // 지원자 상세의 "목록으로" 링크가 검색 조건을 그대로 물고 있어 실제 유출 경로였다.
  it('요소 사슬에 실린 링크 주소의 쿼리스트링도 제거한다', async () => {
    const scrubbed = await sendThroughScrubber(
      eventWith({
        // SDK 의 getElementsChainString 실측 출력 — attr__href 와 베어 href 가 함께 실리고
        // 요소는 세미콜론으로 이어진다. 이 가드의 값어치가 형식 일치에 달려 있어 실측값을 쓴다.
        // 속성 마스킹을 켠 지금 설정에서는 attr__class 가 빠진 형태로 나가므로 이 픽스처는
        // 상위집합이다 — 마스킹을 끄는 경우까지 함께 덮는다.
        $elements_chain:
          'a.text-sm:attr__class="text-sm"' +
          'attr__href="/manage/clubs/1/recruitments/2/applicants?q=홍길동&status=SUBMITTED"' +
          'href="/manage/clubs/1/recruitments/2/applicants?q=홍길동&status=SUBMITTED"' +
          'nth-child="2"nth-of-type="1";div:nth-child="1"nth-of-type="1"',
        $elements: [{ tag_name: 'a', attr__href: '/admin/users?q=20241234' }],
      }),
    );

    expect(scrubbed.properties.$elements_chain).toBe(
      'a.text-sm:attr__class="text-sm"' +
        'attr__href="/manage/clubs/1/recruitments/2/applicants"' +
        'href="/manage/clubs/1/recruitments/2/applicants"' +
        'nth-child="2"nth-of-type="1";div:nth-child="1"nth-of-type="1"',
    );
    expect(scrubbed.properties.$elements).toEqual([{ tag_name: 'a', attr__href: '/admin/users' }]);
  });

  // 사람 속성은 이벤트 속성과 다른 자리로 실린다 — 최초 방문 주소가 여기 담긴다.
  it('사람 속성에 실리는 최초 방문 주소도 정제한다', async () => {
    const scrubbed = await sendThroughScrubber({
      uuid: 'test-uuid',
      event: '$identify',
      properties: {},
      $set: { $current_url: 'https://duings.com/clubs?q=비밀' },
      $set_once: { $initial_current_url: 'https://duings.com/clubs?q=비밀' },
    });

    expect(scrubbed.$set).toMatchObject({ $current_url: 'https://duings.com/clubs' });
    expect(scrubbed.$set_once).toMatchObject({ $initial_current_url: 'https://duings.com/clubs' });
  });

  // $referrer 는 URL 이 아닌 값($direct)도 담는다 — 정제가 값을 망가뜨리면 유입 분석이 깨진다.
  it('URL 이 아닌 속성과 쿼리 없는 주소는 그대로 둔다', async () => {
    const scrubbed = await sendThroughScrubber(
      eventWith({
        $referrer: '$direct',
        $current_url: 'https://duings.com/clubs',
        $screen_name: '탐색',
      }),
    );

    expect(scrubbed.properties).toMatchObject({
      $referrer: '$direct',
      $current_url: 'https://duings.com/clubs',
      $screen_name: '탐색',
    });
  });
});
