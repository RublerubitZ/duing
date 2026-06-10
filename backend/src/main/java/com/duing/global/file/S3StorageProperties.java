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
        publicBaseUrl = stripTrailingSlash(publicBaseUrl);
    }

    private static String stripTrailingSlash(String url) {
        if (url == null || url.isBlank()) {
            return url;
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }
}
