import { describe, expect, it } from 'vitest';
import {
  buildSmsDeeplink,
  isIosUserAgent,
  isMobileUserAgent,
  formatSeconds,
  mapIssueError,
  mapStatusError,
} from '@/app/_lib/phone-verification';
import { ApiError } from '@duing/api';

describe('phone-verification 유틸', () => {
  it('iOS UA 는 sms 딥링크에 & 구분자를 쓴다', () => {
    expect(buildSmsDeeplink('16663538', '7K3M9PXQ', true)).toBe('sms:16663538&body=7K3M9PXQ');
  });
  it('비 iOS UA 는 ? 구분자를 쓴다', () => {
    expect(buildSmsDeeplink('16663538', '7K3M9PXQ', false)).toBe('sms:16663538?body=7K3M9PXQ');
  });
  it('본문은 URL 인코딩된다', () => {
    expect(buildSmsDeeplink('16663538', 'A B', false)).toBe('sms:16663538?body=A%20B');
  });
  it('iPhone UA 를 iOS 로 판정한다', () => {
    expect(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(isIosUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBe(false);
  });
  it('모바일 UA 를 판정한다', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14)')).toBe(true);
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe(false);
  });
  it('초를 mm:ss 로 만든다', () => {
    expect(formatSeconds(65)).toBe('01:05');
  });
  it('발급 에러 코드를 한국어로 매핑한다', () => {
    expect(mapIssueError(new ApiError(409, 'x', undefined, 'PHONE_ALREADY_REGISTERED'))).toContain('이미 가입');
    expect(mapIssueError(new ApiError(429, 'x', undefined, 'PHONE_VERIFICATION_COOLDOWN'))).toContain('잠시 후');
  });
  it('상태조회 에러 코드를 한국어로 매핑한다', () => {
    expect(mapStatusError(new ApiError(503, 'x', undefined, 'SMS_POLL_QUOTA_EXCEEDED'))).toContain('제한');
    expect(mapStatusError(new ApiError(404, 'x', undefined, 'PHONE_VERIFICATION_NOT_FOUND'))).toContain('다시 시작');
  });
});
