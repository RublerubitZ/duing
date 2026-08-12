import { describe, it, expect } from 'vitest';
import {
  ALLOWED_EXTERNAL_FORM_HOSTS,
  EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE,
  createRecruitmentSchema,
  isAllowedExternalFormUrl,
} from '../src/index';

// 이 목록은 BE ExternalFormUrlValidator.ALLOWED_HOSTS 와 같아야 한다. 양쪽 테스트가 리터럴을 그대로
// 단언하므로(BE: allowedHostListMatchesSpecTable) 한쪽만 플랫폼을 늘리면 반대쪽이 깨져 드리프트를 알린다.
describe('외부 폼 URL 허용 목록 — BE 동기화 가드', () => {
  it('허용 호스트 목록은 스펙 §3 표(forms.gle / docs.google.com+/forms / form.naver.com / naver.me)와 정확히 일치한다', () => {
    expect(ALLOWED_EXTERNAL_FORM_HOSTS).toEqual([
      { host: 'forms.gle', requiredPathPrefix: '' },
      { host: 'docs.google.com', requiredPathPrefix: '/forms' },
      { host: 'form.naver.com', requiredPathPrefix: '' },
      { host: 'naver.me', requiredPathPrefix: '' },
    ]);
  });

  it('거부 메시지에는 허용 플랫폼 안내가 한국어로 들어 있다', () => {
    expect(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE).toContain('forms.gle');
    expect(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE).toContain('docs.google.com');
    expect(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE).toContain('form.naver.com');
    expect(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE).toContain('naver.me');
    expect(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE).toContain('https');
  });
});

describe('isAllowedExternalFormUrl — BE ExternalFormUrlValidatorTest 와 동일 매트릭스', () => {
  it.each([
    'https://forms.gle/aBcD1234',
    'https://docs.google.com/forms/d/e/1FAIpQLSf/viewform?usp=sf_link',
    'https://docs.google.com/forms/u/0/d/e/abc/viewform',
    'https://form.naver.com/response/abc123',
    'https://naver.me/5sulQYsy',
    // 호스트는 대소문자를 구분하지 않는다.
    'https://DOCS.Google.COM/forms/d/e/xyz/viewform',
  ])('허용 플랫폼의 https 주소(%s)는 통과한다', (url) => {
    expect(isAllowedExternalFormUrl(url)).toBe(true);
  });

  it.each([
    // https 가 아닌 스킴
    'http://forms.gle/aBcD1234',
    'javascript:alert(document.cookie)',
    'ftp://forms.gle/aBcD1234',
    // 호스트 위장 — 부분 문자열·endsWith 검증이었다면 통과했을 값들
    'https://docs.google.com.evil.com/forms',
    'https://evil.com/docs.google.com/forms',
    'https://evildocs.google.com/forms',
    'https://forms.gle.evil.com/abc',
    // userinfo 트릭 — 사람 눈에는 허용 호스트지만 실제 호스트는 evil.com 이다
    'https://docs.google.com@evil.com/forms',
    'https://forms.gle@evil.com/abc',
    'https://user@forms.gle/aBcD1234',
    // docs.google.com 은 /forms 로 시작하지 않는 경로를 허용하지 않는다
    'https://docs.google.com',
    'https://docs.google.com/',
    'https://docs.google.com/document/d/abc/edit',
    'https://docs.google.com/spreadsheets/d/abc/edit',
    // 목록에 없는 도메인 — naver.me 는 정확 일치라 접미사 위장·서브도메인 모두 거부된다
    'https://example.com/form',
    'https://forms.google.com/x',
    'https://naver.me.evil.com/abc',
    'https://x.naver.me/abc',
    // 파싱 불가·상대 경로·호스트 없음·공백 포함
    'https://forms.gle/ 공백 포함',
    '/forms/d/e/abc',
    'forms.gle/aBcD1234',
    'https:///forms',
    '',
  ])('허용되지 않는 주소(%s)는 거부한다', (url) => {
    expect(isAllowedExternalFormUrl(url)).toBe(false);
  });
});

describe('createRecruitmentSchema — 외부 폼 URL 화이트리스트', () => {
  // 고정 날짜는 "종료일은 오늘 이후" 규칙에 만료된다 — 이 파일의 관심사는 URL 뿐이라 상대 미래 날짜로 둔다.
  const futureEndDate = new Date(Date.now() + 30 * 86_400_000);
  const externalBase = {
    title: '외부 폼 모집',
    startDate: '2026-05-01',
    endDate: `${futureEndDate.getFullYear()}-${String(futureEndDate.getMonth() + 1).padStart(2, '0')}-${String(futureEndDate.getDate()).padStart(2, '0')}`,
    capacity: 10,
    applicationMode: 'EXTERNAL' as const,
    useInterview: false,
  };

  it('허용 플랫폼 URL 이면 통과한다', () => {
    expect(
      createRecruitmentSchema.safeParse({
        ...externalBase,
        externalFormUrl: 'https://forms.gle/aBcD1234',
      }).success,
    ).toBe(true);
  });

  it('허용되지 않는 URL 이면 허용 플랫폼 안내 메시지로 막는다', () => {
    const result = createRecruitmentSchema.safeParse({
      ...externalBase,
      externalFormUrl: 'https://evil.com/docs.google.com/forms',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(EXTERNAL_FORM_URL_NOT_ALLOWED_MESSAGE);
      expect(result.error.issues[0]?.path).toEqual(['externalFormUrl']);
    }
  });

  it('URL 이 비어 있으면 화이트리스트가 아니라 기존 "필수" 안내가 먼저 나온다', () => {
    const result = createRecruitmentSchema.safeParse({ ...externalBase, externalFormUrl: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('외부 폼 URL은 필수 입력값입니다.');
    }
  });

  it('자체 폼 모집은 화이트리스트 검증 대상이 아니다', () => {
    const result = createRecruitmentSchema.safeParse({
      ...externalBase,
      applicationMode: 'SELF',
      externalFormUrl: undefined,
      questionItems: [{ id: null, text: '지원 동기는?', type: 'TEXT', required: true, choices: [] }],
    });

    expect(result.success).toBe(true);
  });
});
