/**
 * 외부 폼 URL 의 호스트로 플랫폼명을 판별한다 (스펙 §5 헤더 배지).
 *
 * 허용 호스트 목록은 BE 와 동기화된 `ALLOWED_EXTERNAL_FORM_HOSTS`(@duing/schemas)가 SoT 이고,
 * 여기 라벨 표는 그 호스트에 대응하는 표시명만 갖는다 — 목록에 호스트를 추가하고 라벨을 빠뜨리면
 * externalFormPlatform 테스트(모든 허용 호스트에 라벨 존재)가 깨져 드리프트를 알린다.
 * 검증을 통과하지 않은 레거시 URL 도 그대로 저장돼 있으므로 판별 실패는 null(배지에 이름 생략)이다.
 */
const PLATFORM_LABEL_BY_HOST: Readonly<Record<string, string>> = {
  'forms.gle': 'Google Forms',
  'docs.google.com': 'Google Forms',
  'form.naver.com': 'Naver Form',
};

export function externalFormPlatformLabel(externalFormUrl: string | null): string | null {
  if (!externalFormUrl) return null;
  try {
    // hostname 은 파서가 이미 소문자로 정규화하지만, 호출부가 어떤 값을 넣어도 같게 읽히도록 명시한다.
    return PLATFORM_LABEL_BY_HOST[new URL(externalFormUrl).hostname.toLowerCase()] ?? null;
  } catch {
    return null;
  }
}
