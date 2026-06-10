package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.StubFileStorageService;
import com.duing.global.config.S3ClientConfig;
import java.nio.file.Path;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * L3 — Storage 빈 활성화/비활성화 메커니즘 회귀 게이트.
 *
 * <p>이 PR 의 "silent fallback 근절" 약속 (matchIfMissing 안전망 + @Validated fail-fast)
 * 이 미래에도 깨지지 않도록 자동으로 검증한다. 누군가 @Validated 를 제거하거나
 * @ConfigurationPropertiesScan 으로 전역화하면 여기서 빨간불.
 */
class StorageBeanActivationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(
                    S3ClientConfig.class,
                    LocalFileStorageService.class,
                    S3FileStorageService.class,
                    StubFileStorageService.class
            );

    @Test
    @DisplayName("file.storage.provider 미설정 시 LocalFileStorageService 가 활성된다")
    void localActiveByMatchIfMissing(@TempDir Path tempDir) {
        runner.withPropertyValues("file.upload-dir=" + tempDir)
                .run(context -> assertThat(context)
                        .hasSingleBean(LocalFileStorageService.class)
                        .doesNotHaveBean(S3FileStorageService.class)
                        .doesNotHaveBean(StubFileStorageService.class));
    }

    @Test
    @DisplayName("file.storage.provider=s3 일 때 S3FileStorageService 만 활성되고 다른 구현체는 비활성된다")
    void s3OnlyActivatedByProvider() {
        runner.withPropertyValues(
                        "file.storage.provider=s3",
                        "s3.endpoint=http://example.com",
                        "s3.region=auto",
                        "s3.access-key=ak",
                        "s3.secret-key=sk",
                        "s3.bucket=duing",
                        "s3.public-base-url=http://example.com")
                .run(context -> assertThat(context)
                        .hasSingleBean(S3FileStorageService.class)
                        .doesNotHaveBean(LocalFileStorageService.class)
                        .doesNotHaveBean(StubFileStorageService.class));
    }

    @Test
    @DisplayName("file.storage.provider=stub 일 때 StubFileStorageService 만 활성된다")
    void stubActivatedByProvider() {
        runner.withPropertyValues("file.storage.provider=stub")
                .run(context -> assertThat(context)
                        .hasSingleBean(StubFileStorageService.class)
                        .doesNotHaveBean(LocalFileStorageService.class)
                        .doesNotHaveBean(S3FileStorageService.class));
    }

    @Test
    @DisplayName("file.storage.provider=s3 인데 s3.access-key 가 비어 있으면 컨텍스트 부팅이 실패한다")
    void s3FailFastOnMissingAccessKey() {
        runner.withPropertyValues(
                        "file.storage.provider=s3",
                        "s3.endpoint=http://example.com",
                        "s3.region=auto",
                        "s3.access-key=",
                        "s3.secret-key=sk",
                        "s3.bucket=duing",
                        "s3.public-base-url=http://example.com")
                .run(context -> assertThat(context).hasFailed());
    }

    @Test
    @DisplayName("file.storage.provider=s3 인데 s3.public-base-url 이 비어 있으면 컨텍스트 부팅이 실패한다")
    void s3FailFastOnMissingPublicBaseUrl() {
        runner.withPropertyValues(
                        "file.storage.provider=s3",
                        "s3.endpoint=http://example.com",
                        "s3.region=auto",
                        "s3.access-key=ak",
                        "s3.secret-key=sk",
                        "s3.bucket=duing",
                        "s3.public-base-url=")
                .run(context -> assertThat(context).hasFailed());
    }
}
