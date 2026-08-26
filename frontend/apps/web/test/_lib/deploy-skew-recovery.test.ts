import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 배포 스큐 복구 판정·리로드 가드 테스트.
 *
 * <p>픽스처 메시지·스택은 2026-08-25 prod Sentry 실물(NEXT-DUING-1B·1C·19·1A)을 그대로 옮겼다 —
 * 판정 정규식이 실제 부호에서 어긋나면 여기서 바로 드러난다. 모듈 상태(리로드 예약 플래그)가
 * 테스트 간에 새지 않도록 매번 새로 평가한다.
 */
async function loadModule() {
  vi.resetModules();
  return await import('@/app/_lib/deploySkewRecovery');
}

/** prod 스택 모양의 Error 를 만든다 — stack 은 브라우저가 채우는 값이라 직접 덮어쓴다. */
function errorWith(message: string, stack: string, name = 'TypeError'): Error {
  const fixture = new Error(message);
  fixture.name = name;
  fixture.stack = stack;
  return fixture;
}

const WEBPACK_FRAME_STACK =
  "r@https://duings.com/_next/static/chunks/webpack-108e0ae275efc401.js:1:516\n" +
  'https://duings.com/_next/static/chunks/webpack-108e0ae275efc401.js:1:511';

const APP_FRAME_STACK =
  'TypeError: ...\n    at handleClick (https://duings.com/_next/static/chunks/app/clubs/page-e32de5990af5414c.js:1:100)';

describe('isDeploySkewError — positive (스큐 부호)', () => {
  it('Safari prod 실물: e[o].call 모듈 미스', async () => {
    const { isDeploySkewError } = await loadModule();
    expect(
      isDeploySkewError(
        errorWith("undefined is not an object (evaluating 'e[o].call')", WEBPACK_FRAME_STACK),
      ),
    ).toBe(true);
  });

  it('Chromium prod 실물: reading call 모듈 미스', async () => {
    const { isDeploySkewError } = await loadModule();
    expect(
      isDeploySkewError(
        errorWith(
          "Cannot read properties of undefined (reading 'call')",
          'TypeError: ...\n    at r (https://duings.com/_next/static/chunks/webpack-c9c222752d713b00.js:1:516)',
        ),
      ),
    ).toBe(true);
  });

  it('ChunkLoadError (소멸 청크 404)', async () => {
    const { isDeploySkewError } = await loadModule();
    expect(isDeploySkewError(errorWith('Loading chunk 4611 failed.', 'anywhere', 'ChunkLoadError'))).toBe(
      true,
    );
  });
});

describe('isDeploySkewError — negative (리로드 금지 대상)', () => {
  // 앱 코드의 우연한 undefined.call 은 스택에 webpack 런타임 프레임이 없다.
  it('webpack 프레임 없는 일반 undefined.call', async () => {
    const { isDeploySkewError } = await loadModule();
    expect(
      isDeploySkewError(
        errorWith("Cannot read properties of undefined (reading 'call')", APP_FRAME_STACK),
      ),
    ).toBe(false);
  });

  // Error A 계열은 스큐가 아니다 — 리로드해도 복구되지 않는다.
  it('removeChild null (Error A)', async () => {
    const { isDeploySkewError } = await loadModule();
    expect(
      isDeploySkewError(
        errorWith("Cannot read properties of null (reading 'removeChild')", WEBPACK_FRAME_STACK),
      ),
    ).toBe(false);
  });

  it('React #454 (Error A)', async () => {
    const { isDeploySkewError } = await loadModule();
    expect(
      isDeploySkewError(
        errorWith(
          'Minified React error #454; visit https://react.dev/errors/454 for the full message',
          WEBPACK_FRAME_STACK,
        ),
      ),
    ).toBe(false);
  });

  it('일반 TypeError·비Error 값', async () => {
    const { isDeploySkewError } = await loadModule();
    expect(isDeploySkewError(errorWith('그냥 실패', WEBPACK_FRAME_STACK))).toBe(false);
    expect(isDeploySkewError("undefined is not an object (evaluating 'e[o].call')")).toBe(false);
    expect(isDeploySkewError(null)).toBe(false);
  });
});

describe('installDeploySkewRecovery — 복구 안전장치', () => {
  // window 는 파일 내 테스트가 공유한다 — 케이스마다 리스너를 해제해 앞 테스트의 모듈 인스턴스가
  // 뒤 테스트의 스토리지 슬롯을 선점하지 않게 한다.
  const uninstalls: Array<() => void> = [];

  beforeEach(() => {
    vi.useFakeTimers();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    for (const uninstall of uninstalls) uninstall();
    uninstalls.length = 0;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function dispatchSkewRejection(): void {
    const skewError = errorWith(
      "undefined is not an object (evaluating 'e[o].call')",
      WEBPACK_FRAME_STACK,
    );
    // jsdom 의 PromiseRejectionEvent 부재를 우회 — 리스너는 event.reason 만 읽는다.
    const rejectionEvent = new Event('unhandledrejection');
    Object.defineProperty(rejectionEvent, 'reason', { value: skewError });
    window.dispatchEvent(rejectionEvent);
  }

  /** 리로드 후의 새 페이지처럼 모듈을 새로 평가해 스큐를 1회 흘리고 리로드 여부를 돌려준다. */
  async function skewOnFreshPage(): Promise<boolean> {
    const { installDeploySkewRecovery } = await loadModule();
    const reload = vi.fn();
    const uninstall = installDeploySkewRecovery(reload);
    dispatchSkewRejection();
    vi.runAllTimers();
    uninstall();
    return reload.mock.calls.length > 0;
  }

  it('스큐 오류를 감지하면 리로드를 1회만 예약한다 (버스트 4~7건도 1회)', async () => {
    const { installDeploySkewRecovery } = await loadModule();
    const reload = vi.fn();
    uninstalls.push(installDeploySkewRecovery(reload));

    dispatchSkewRejection();
    dispatchSkewRejection();
    dispatchSkewRejection();
    vi.runAllTimers();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('직전 리로드가 60초 내면 다시 리로드하지 않는다 (루프 방지)', async () => {
    expect(await skewOnFreshPage()).toBe(true);
    expect(await skewOnFreshPage()).toBe(false);
  });

  it('간격이 지나도 세션당 3회를 넘겨 리로드하지 않는다 (총량 상한)', async () => {
    for (const expected of [true, true, true, false, false]) {
      expect(await skewOnFreshPage()).toBe(expected);
      // 다음 시도가 간격 제한이 아니라 총량 상한으로만 걸리도록 60초를 흘린다.
      vi.setSystemTime(Date.now() + 61_000);
    }
  });

  it('sessionStorage 를 못 쓰면 리로드하지 않는다 (루프 방지 불가 → fail-open)', async () => {
    const { installDeploySkewRecovery } = await loadModule();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const reload = vi.fn();
    uninstalls.push(installDeploySkewRecovery(reload));

    dispatchSkewRejection();
    vi.runAllTimers();

    expect(reload).not.toHaveBeenCalled();
  });

  it('스큐가 아닌 오류에는 반응하지 않는다', async () => {
    const { installDeploySkewRecovery } = await loadModule();
    const reload = vi.fn();
    uninstalls.push(installDeploySkewRecovery(reload));

    const ordinaryEvent = new Event('unhandledrejection');
    Object.defineProperty(ordinaryEvent, 'reason', { value: new Error('일반 실패') });
    window.dispatchEvent(ordinaryEvent);
    vi.runAllTimers();

    expect(reload).not.toHaveBeenCalled();
  });
});
