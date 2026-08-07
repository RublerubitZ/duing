import type { PostHogConfig } from 'posthog-js';
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

  // 예외는 Sentry 전담 — PostHog 로 중복 캡처되면 예외 메시지를 타고 PII 가 한 번 더 흘러간다.
  it('예외 캡처를 PostHog 에서 켜지 않는다', async () => {
    const options = await captureInitOptions();
    expect(options.capture_exceptions).toBe(false);
  });

  // 관리자 콘솔 검색어는 주소에 실린다(`?q=이름·학번`). 페이지뷰가 히스토리 변경마다 나가므로
  // 이 정제가 빠지면 "누가 누구를 검색했는지"가 분석 도구에 쌓이고 회수할 수 없다.
  it('URL 속성의 쿼리스트링을 제거한 뒤 전송한다', async () => {
    const options = await captureInitOptions();
    const sanitized = options.sanitize_properties?.(
      {
        $current_url: 'https://duings.com/manage/clubs/1/applicants?q=홍길동&status=SUBMITTED',
        $referrer: 'https://duings.com/admin/users?q=20241234',
        $initial_current_url: 'https://duings.com/clubs?recruitment=available',
        $pathname: '/manage/clubs/1/applicants',
      },
      '$pageview',
    );

    expect(sanitized).toMatchObject({
      $current_url: 'https://duings.com/manage/clubs/1/applicants',
      $referrer: 'https://duings.com/admin/users',
      $initial_current_url: 'https://duings.com/clubs',
      $pathname: '/manage/clubs/1/applicants',
    });
  });

  // $referrer 는 URL 이 아닌 값($direct)도 담는다 — 정제가 값을 망가뜨리면 유입 분석이 깨진다.
  it('URL 이 아닌 속성과 쿼리 없는 주소는 그대로 둔다', async () => {
    const options = await captureInitOptions();
    const sanitized = options.sanitize_properties?.(
      { $referrer: '$direct', $current_url: 'https://duings.com/clubs', $screen_name: '탐색' },
      '$pageview',
    );

    expect(sanitized).toMatchObject({
      $referrer: '$direct',
      $current_url: 'https://duings.com/clubs',
      $screen_name: '탐색',
    });
  });
});
