import type { ErrorEvent } from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fingerprintAndDedupeHydrationError } from '@/sentry-hydration';

// 운영에서 Sentry 전역 핸들러가 보내는 하이드레이션 오류의 모양(10/23 운영 /clubs/38 실측 메시지).
function hydrationEvent(url: string | undefined, errorCode = 418): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [
        {
          type: 'Error',
          value:
            `Minified React error #${errorCode}; visit https://react.dev/errors/${errorCode}?args[]=text&args[]= ` +
            'for the full message or use the non-minified dev environment for full errors and additional helpful warnings.',
        },
      ],
    },
    request: url === undefined ? undefined : { url },
  };
}

function pageKeyOf(url: string | undefined): unknown {
  window.sessionStorage.clear();
  return fingerprintAndDedupeHydrationError(hydrationEvent(url))?.fingerprint?.[2];
}

describe('fingerprintAndDedupeHydrationError', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('하이드레이션 오류를 코드·페이지별 fingerprint 로 나누고, 이슈 목록에 보이게 transaction 에도 페이지를 넣는다', () => {
    const sent = fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38'));

    expect(sent?.fingerprint).toEqual(['react-hydration-error', '#418', '/clubs/:id']);
    expect(sent?.transaction).toBe('/clubs/:id');
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38', 424))
        ?.fingerprint,
    ).toEqual(['react-hydration-error', '#424', '/clubs/:id']);
  });

  it('숫자 ID·초대 코드·정적이 아닌 세그먼트를 묶고, 쿼리·해시·끝 슬래시는 무시한다', () => {
    expect(pageKeyOf('https://duings.com/manage/clubs/12/recruitments/80/applicants/')).toBe(
      '/manage/clubs/:id/recruitments/:id/applicants',
    );
    expect(pageKeyOf('https://duings.com/clubs/38?tab=intro#members')).toBe('/clubs/:id');
    expect(pageKeyOf('https://duings.com/')).toBe('/');
    // 초대 코드는 숫자만이거나 소문자로 입력돼도 같은 페이지다 — fingerprint 에 코드가 실리지 않는다.
    expect(pageKeyOf('https://duings.com/join/ABCDEF')).toBe('/join/:code');
    expect(pageKeyOf('https://duings.com/join/123456')).toBe('/join/:code');
    expect(pageKeyOf('https://duings.com/join/abcdef')).toBe('/join/:code');
    // 잘못된 ID·임의의 404 경로는 입력한 문자열 대신 한 키로 묶는다.
    expect(pageKeyOf('https://duings.com/clubs/%ED%99%8D%EA%B8%B8%EB%8F%99')).toBe('/clubs/:param');
    expect(pageKeyOf('https://duings.com/wp-login.php')).toBe('/:param');
    expect(pageKeyOf('https://duings.com/403')).toBe('/403');
  });

  it.each([418, 419, 421, 422, 423, 424, 425])('#%i 를 하이드레이션 오류로 본다', (errorCode) => {
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38', errorCode))
        ?.fingerprint,
    ).toEqual(['react-hydration-error', `#${errorCode}`, '/clubs/:id']);
  });

  it('주소가 없거나 읽을 수 없으면 unknown 페이지로 나눈다', () => {
    expect(pageKeyOf(undefined)).toBe('unknown');
    expect(pageKeyOf('not a url')).toBe('unknown');
  });

  it('예외 사슬의 첫 값이 아니어도 하이드레이션 오류로 본다', () => {
    const event = hydrationEvent('https://duings.com/terms');
    event.exception?.values?.unshift({ type: 'Error', value: 'wrapped' });

    expect(fingerprintAndDedupeHydrationError(event)?.fingerprint).toEqual([
      'react-hydration-error',
      '#418',
      '/terms',
    ]);
  });

  it('같은 탭에서 같은 코드·페이지의 두 번째 오류는 보내지 않고, 다른 페이지나 다른 코드는 보낸다', () => {
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38')),
    ).not.toBeNull();
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38')),
    ).toBeNull();
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/41')),
    ).toBeNull();
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/terms')),
    ).not.toBeNull();
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38', 419)),
    ).not.toBeNull();
  });

  it('저장소를 읽지 못하거나 쓰지 못하면 제한 없이 보낸다', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38')),
    ).not.toBeNull();
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38')),
    ).not.toBeNull();

    getItem.mockRestore();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38')),
    ).not.toBeNull();
    expect(
      fingerprintAndDedupeHydrationError(hydrationEvent('https://duings.com/clubs/38')),
    ).not.toBeNull();
  });

  it('하이드레이션이 아닌 오류는 손대지 않고 저장소에도 남기지 않는다', () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: {
        values: [
          { type: 'Error', value: 'Minified React error #31; visit https://react.dev/errors/31' },
        ],
      },
      request: { url: 'https://duings.com/clubs/38' },
    };

    expect(fingerprintAndDedupeHydrationError(event)).toBe(event);
    expect(fingerprintAndDedupeHydrationError(event)).toBe(event);
    expect(event.fingerprint).toBeUndefined();
    expect(event.transaction).toBeUndefined();
    expect(window.sessionStorage.length).toBe(0);
  });
});
