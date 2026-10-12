package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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

    @Test
    @DisplayName("값이 해석되지 않은 자리표시자(${...})면 record 생성이 거부되고 메시지에는 키 이름만 실린다")
    void rejectsUnresolvedPlaceholder() {
        assertThatThrownBy(() -> new S3StorageProperties(
                "https://example.com", "auto", "${S3_ACCESS_KEY}", "sk", "duing", "https://files.duing.app"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("s3.access-key");
    }
}
