package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
    @DisplayName("절대경로 키를 주입해도 rootDir 밖을 가리키므로 null 을 반환한다")
    void downloadRejectsAbsolutePathKeyOutsideRootDir() {
        // Path#resolve 는 인자가 절대경로면 rootDir 를 무시하고 그 절대경로를 그대로 반환한다 —
        // normalize 이후에도 rootDir 프리픽스를 벗어나므로 startsWith 가드에서 걸러져야 한다.
        StoredFile storedFile = service.download("/etc/passwd");

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

    @Test
    @DisplayName("존재하는 파일을 delete 하면 파일이 제거되고 삭제 확정(true)을 반환한다")
    void deleteReturnsTrueAndRemovesExistingFile() throws IOException {
        Path directory = rootDir.resolve("federation/inquiry");
        Files.createDirectories(directory);
        Path file = directory.resolve("purge-target.jpg");
        Files.write(file, "bytes".getBytes());

        boolean deleted = service.delete("/files/federation/inquiry/purge-target.jpg");

        assertThat(deleted).isTrue();
        assertThat(Files.exists(file)).isFalse();
    }

    @Test
    @DisplayName("존재하지 않는 파일의 delete 도 삭제 확정(true)을 반환한다 (객체 부재 = 삭제 확정, 멱등)")
    void deleteReturnsTrueForMissingFile() {
        // 파기 배치 재실행·크래시 윈도우에서 이미 지워진 객체를 다시 지워도 성공으로 수렴해야
        // 남은 DB 행이 영구 재시도 루프에 빠지지 않는다.
        assertThat(service.delete("/files/federation/inquiry/already-gone.jpg")).isTrue();
    }

    @Test
    @DisplayName("rootDir 밖을 가리키는 URL 과 null/빈 URL 의 delete 는 삭제 미확정(false)을 반환한다")
    void deleteReturnsFalseForUnmanagedUrls() {
        assertThat(service.delete("/files/../../etc/passwd")).isFalse(); // 경로 탈출 — 관리 밖 경로
        assertThat(service.delete(null)).isFalse();
        assertThat(service.delete("")).isFalse();
    }

    @Test
    @DisplayName("존재 확인은 통과했지만 실제 읽기 권한이 없는 파일은 null 이 아니라 IllegalStateException 을 전파한다")
    void downloadPropagatesIOExceptionAfterExistenceCheckPasses() throws IOException {
        Path directory = rootDir.resolve("federation/inquiry");
        Files.createDirectories(directory);
        Path file = directory.resolve("locked.jpg");
        Files.write(file, "hello".getBytes());
        // Files.isRegularFile·Files.size 는 파일 자체의 read 권한 없이도 성공하므로(존재 확인 통과),
        // FileInputStream 오픈만 실패하는 상황을 재현해 "존재 확인 이후의 실제 I/O 장애" 분기(catch)에
        // 도달시킨다 — S3 sizeOf/download 의 SdkException 전파와 동일한 원칙 검증.
        assertThat(file.toFile().setReadable(false, false)).isTrue();
        try {
            assertThatThrownBy(() -> service.download("federation/inquiry/locked.jpg"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("파일 다운로드에 실패했습니다");
        } finally {
            file.toFile().setReadable(true, false);
        }
    }
}
