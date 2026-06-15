package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class S3StoragePropertiesTest {

    @Test
    @DisplayName("publicBaseUrl 끝에 슬래시가 있으면 record 생성 시 제거되어 보관된다")
    void normalizesTrailingSlashInPublicBaseUrl() {
        S3StorageProperties properties = new S3StorageProperties(
                "https://example.com",
                "auto",
                "ak",
                "sk",
                "duing",
                "https://files.duing.app/"
        );

        assertThat(properties.publicBaseUrl()).isEqualTo("https://files.duing.app");
    }

    @Test
    @DisplayName("publicBaseUrl 끝에 슬래시가 없으면 그대로 보관된다")
    void preservesPublicBaseUrlWithoutTrailingSlash() {
        S3StorageProperties properties = new S3StorageProperties(
                "https://example.com",
                "auto",
                "ak",
                "sk",
                "duing",
                "https://files.duing.app"
        );

        assertThat(properties.publicBaseUrl()).isEqualTo("https://files.duing.app");
    }

    @Test
    @DisplayName("publicBaseUrl 끝에 슬래시가 여러 개 있어도 모두 제거되어 보관된다")
    void normalizesMultipleTrailingSlashes() {
        S3StorageProperties properties = new S3StorageProperties(
                "https://example.com",
                "auto",
                "ak",
                "sk",
                "duing",
                "https://files.duing.app///"
        );

        assertThat(properties.publicBaseUrl()).isEqualTo("https://files.duing.app");
    }
}
