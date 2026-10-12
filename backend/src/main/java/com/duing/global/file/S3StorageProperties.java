package com.duing.global.file;

import jakarta.validation.constraints.NotBlank;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

/**
 * S3 호환 스토리지(R2 / MinIO / AWS S3) 설정 바인딩.
 *
 * <p>활성화·등록은 {@link com.duing.global.config.S3ClientConfig} 의
 * {@code @EnableConfigurationProperties} 로만 이루어진다. {@code @Component} 나
 * {@code @ConfigurationPropertiesScan} 으로 전역 등록하면 local 프로파일에서도 빈 문자열
 * 기본값이 {@code @NotBlank} 위반으로 부팅을 깬다.
 *
 * <p>{@code @Validated} 가 클래스에 없으면 record 의 JSR-380 검증이 발동하지 않아
 * fail-fast 약속이 거짓말이 된다.
 */
@Validated
@ConfigurationProperties(prefix = "s3")
public record S3StorageProperties(
        @NotBlank String endpoint,
        @NotBlank String region,
        @NotBlank String accessKey,
        @NotBlank String secretKey,
        @NotBlank String bucket,
        @NotBlank String publicBaseUrl
) {
    public S3StorageProperties {
        rejectUnresolvedPlaceholder("s3.endpoint", endpoint);
        rejectUnresolvedPlaceholder("s3.region", region);
        rejectUnresolvedPlaceholder("s3.access-key", accessKey);
        rejectUnresolvedPlaceholder("s3.secret-key", secretKey);
        rejectUnresolvedPlaceholder("s3.bucket", bucket);
        rejectUnresolvedPlaceholder("s3.public-base-url", publicBaseUrl);
        publicBaseUrl = stripTrailingSlash(publicBaseUrl);
    }

    // Binder 는 풀리지 않은 ${…} 를 문자열로 남겨 @NotBlank 를 통과시킨다 — 운영 yml 이 기본값 없이 받는 S3_* 가
    // 빠졌을 때 첫 업로드가 아니라 기동에서 실패하게 한다(#1324). 메시지에는 값이 아니라 키 이름만 싣는다.
    private static void rejectUnresolvedPlaceholder(String propertyKey, String value) {
        if (value != null && value.startsWith("${")) {
            throw new IllegalArgumentException(propertyKey + " 값이 해석되지 않았습니다 — 해당 S3_* 환경변수를 주입하세요.");
        }
    }

    private static String stripTrailingSlash(String url) {
        if (url == null || url.isBlank()) {
            return url;
        }
        String result = url;
        while (result.endsWith("/")) {
            result = result.substring(0, result.length() - 1);
        }
        return result;
    }
}
