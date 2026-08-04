package com.duing.domain.recruitment.service;

import com.duing.domain.recruitment.exception.RecruitmentException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;

/**
 * 외부 폼 모집의 externalFormUrl 화이트리스트 검증 (스펙 §3).
 *
 * <p>구 검증(<code>^https?://</code> 프리픽스)은 임의 도메인과 http 를 모두 통과시켜, 학생이 클릭하는 링크가
 * 사실상 무제한이었다. 여기서는 허용 플랫폼 3종만, https 로만 받는다.
 *
 * <p>호스트 판정은 {@link URI} 파싱 후 <b>정확 일치</b>다 — 부분 문자열·endsWith 로 판정하면
 * <code>docs.google.com.evil.com</code> 이나 <code>evil.com/docs.google.com/forms</code> 가 통과한다.
 * userinfo(<code>https://docs.google.com&#64;evil.com/forms</code>)는 사람 눈에만 허용 호스트로 보이므로
 * 허용 호스트 여부와 무관하게 거부한다.
 *
 * <p>{@link #ALLOWED_HOSTS} 는 FE(zod)와 같은 목록이어야 한다 — 양쪽 테스트가 목록 리터럴을 그대로
 * 단언하므로 한쪽만 플랫폼을 늘리면 반대쪽 테스트가 깨져 드리프트를 알린다.
 */
public final class ExternalFormUrlValidator {

    /**
     * 허용 플랫폼 1건. 플랫폼 추가는 {@link #ALLOWED_HOSTS} 에 한 줄을 더하는 것으로 끝난다.
     *
     * @param host               정확 일치해야 하는 호스트 (소문자)
     * @param requiredPathPrefix 경로가 이 값으로 시작해야 한다. 제약이 없으면 빈 문자열
     */
    public record AllowedFormHost(String host, String requiredPathPrefix) {}

    public static final List<AllowedFormHost> ALLOWED_HOSTS = List.of(
            new AllowedFormHost("forms.gle", ""),
            new AllowedFormHost("docs.google.com", "/forms"),
            new AllowedFormHost("form.naver.com", ""));

    private static final String HTTPS_SCHEME = "https";

    private static final String NOT_ALLOWED_MESSAGE =
            "외부 폼 URL 은 구글 폼(https://forms.gle/…, https://docs.google.com/forms/…) 또는 "
                    + "네이버 폼(https://form.naver.com/…) 주소만 사용할 수 있습니다. "
                    + "단축 URL 이 아닌 원본 주소를 입력해주세요.";

    private ExternalFormUrlValidator() {
    }

    /** 허용 목록에 없으면 400({@link RecruitmentException.InvalidApplicationModeException}) 을 던진다. */
    public static void validate(String externalFormUrl) {
        if (externalFormUrl == null) {
            throw notAllowed();
        }

        URI parsedUrl;
        try {
            parsedUrl = new URI(externalFormUrl);
        } catch (URISyntaxException malformedUrl) {
            throw notAllowed();
        }

        if (!HTTPS_SCHEME.equalsIgnoreCase(parsedUrl.getScheme())) {
            throw notAllowed();
        }
        if (parsedUrl.getUserInfo() != null) {
            throw notAllowed();
        }

        // 상대 URL·레지스트리 기반 authority(호스트명 규칙 위반) 는 host 가 null 이다.
        String host = parsedUrl.getHost();
        if (host == null) {
            throw notAllowed();
        }

        String normalizedHost = host.toLowerCase(Locale.ROOT);
        String path = parsedUrl.getPath() == null ? "" : parsedUrl.getPath();
        boolean allowed = ALLOWED_HOSTS.stream().anyMatch(allowedHost ->
                allowedHost.host().equals(normalizedHost) && path.startsWith(allowedHost.requiredPathPrefix()));
        if (!allowed) {
            throw notAllowed();
        }
    }

    private static RecruitmentException.InvalidApplicationModeException notAllowed() {
        return new RecruitmentException.InvalidApplicationModeException(NOT_ALLOWED_MESSAGE);
    }
}
