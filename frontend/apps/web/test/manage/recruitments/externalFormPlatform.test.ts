import { describe, expect, it } from 'vitest';
import { ALLOWED_EXTERNAL_FORM_HOSTS } from '@duing/schemas';

import { externalFormPlatformLabel } from '@/app/manage/clubs/[clubId]/recruitments/_lib/externalFormPlatform';

describe('externalFormPlatformLabel', () => {
  it.each([
    ['https://forms.gle/aBcD1234', 'Google Forms'],
    ['https://docs.google.com/forms/d/e/abc/viewform', 'Google Forms'],
    ['https://DOCS.Google.COM/forms/d/e/abc/viewform', 'Google Forms'],
    ['https://form.naver.com/response/abc123', 'Naver Form'],
    // 단축코드는 목적지가 폼임을 보장하지 않으므로 중립 라벨이다.
    ['https://naver.me/5sulQYsy', 'Naver'],
  ])('허용 플랫폼 주소(%s)는 플랫폼명을 돌려준다', (url, expected) => {
    expect(externalFormPlatformLabel(url)).toBe(expected);
  });

  it.each([null, '', 'https://example.com/form', 'not-a-url'])(
    '판별할 수 없는 값(%s)은 null 이다',
    (url) => {
      expect(externalFormPlatformLabel(url)).toBeNull();
    },
  );

  // 화이트리스트에 플랫폼을 추가하고 라벨을 빠뜨리면 배지에 이름이 사라진다 — 여기서 잡는다.
  it('허용 호스트 목록의 모든 호스트에 플랫폼명이 있다', () => {
    for (const { host } of ALLOWED_EXTERNAL_FORM_HOSTS) {
      expect(externalFormPlatformLabel(`https://${host}/forms/x`)).not.toBeNull();
    }
  });
});
