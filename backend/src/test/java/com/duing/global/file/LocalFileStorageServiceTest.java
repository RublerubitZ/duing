package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalFileStorageServiceTest {

    @TempDir
    Path rootDir;

    private LocalFileStorageService service;

    @BeforeEach
    void setUp() {
        service = new LocalFileStorageService(rootDir.toString(), "");
    }

    @Test
    @DisplayName("정상 키는 저장된 파일을 스트림으로 읽어 Content-Type·Content-Length 와 함께 반환한다")
    void downloadReturnsStoredFileForExistingKey() throws IOException {
        Path directory = rootDir.resolve("federation/inquiry");
        Files.createDirectories(directory);
        byte[] content = "hello world".getBytes();
        Files.write(directory.resolve("abc.jpg"), content);

        StoredFile storedFile = service.download("federation/inquiry/abc.jpg");

        assertThat(storedFile).isNotNull();
        assertThat(storedFile.contentType()).isEqualTo("image/jpeg");
        assertThat(storedFile.contentLength()).isEqualTo(content.length);
        assertThat(storedFile.stream().readAllBytes()).isEqualTo(content);
    }

    @Test
    @DisplayName("rootDir 밖을 가리키는 경로 탈출 키는 null 을 반환한다")
    void downloadRejectsPathTraversalOutsideRootDir() {
        StoredFile storedFile = service.download("../../etc/passwd");

        assertThat(storedFile).isNull();
    }

    @Test
    @DisplayName("rootDir 안이지만 실제로 존재하지 않는 키는 null 을 반환한다")
    void downloadReturnsNullWhenFileDoesNotExist() {
        StoredFile storedFile = service.download("federation/inquiry/missing.jpg");

        assertThat(storedFile).isNull();
    }

    @Test
    @DisplayName("null 또는 빈 키는 파일 조회 없이 null 을 반환한다")
    void downloadHandlesNullAndBlankKeys() {
        assertThat(service.download(null)).isNull();
        assertThat(service.download("")).isNull();
        assertThat(service.download("   ")).isNull();
    }
}
