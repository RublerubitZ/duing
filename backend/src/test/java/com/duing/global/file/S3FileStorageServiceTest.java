package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

class S3FileStorageServiceTest {

    private S3Client s3Client;
    private S3StorageProperties properties;
    private S3FileStorageService service;

    @BeforeEach
    void setUp() {
        s3Client = mock(S3Client.class);
        properties = new S3StorageProperties(
                "https://example.com", "auto", "ak", "sk", "duing",
                "https://files.duing.app");
        service = new S3FileStorageService(s3Client, properties);
    }

    @Test
    @DisplayName("directory + UUID 파일명으로 키가 생성되어 PutObject 가 호출된다")
    void uploadCallsPutObjectWithDirectoryUuidKey() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.webp", "image/webp", new byte[]{1, 2, 3});

        service.upload(file, "club/cover");

        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().bucket()).isEqualTo("duing");
        assertThat(captor.getValue().key()).matches("club/cover/[0-9a-f-]{36}\\.webp");
    }

    @Test
    @DisplayName("업로드 시 객체의 Content-Type 이 MultipartFile 의 contentType 으로 저장된다")
    void uploadSetsContentType() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});

        service.upload(file, "club/logo");

        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().contentType()).isEqualTo("image/png");
    }

    @Test
    @DisplayName("Content-Type 이 null 이면 application/octet-stream 으로 폴백된다")
    void uploadFallsBackOctetStreamWhenContentTypeNull() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p", null, new byte[]{1});

        service.upload(file, "x");

        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().contentType()).isEqualTo("application/octet-stream");
    }

    @Test
    @DisplayName("업로드 성공 시 publicBaseUrl + / + key 형태의 URL 이 반환된다")
    void uploadReturnsPublicUrl() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});

        String url = service.upload(file, "club/cover");

        assertThat(url).startsWith("https://files.duing.app/club/cover/")
                .endsWith(".png");
    }

    @Test
    @DisplayName("publicBaseUrl 끝에 슬래시가 있어도 업로드 반환 URL 의 슬래시는 1개로 유지된다")
    void uploadHandlesTrailingSlashInBaseUrl() {
        S3StorageProperties propertiesWithSlash = new S3StorageProperties(
                "https://example.com", "auto", "ak", "sk", "duing",
                "https://files.duing.app/");
        S3FileStorageService serviceWithSlash =
                new S3FileStorageService(s3Client, propertiesWithSlash);
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});

        String url = serviceWithSlash.upload(file, "club/cover");

        assertThat(url).startsWith("https://files.duing.app/club/cover/")
                .doesNotContain("//club");
    }

    @Test
    @DisplayName("파일이 비어 있으면 IllegalArgumentException 이 발생하고 S3 호출이 일어나지 않는다")
    void uploadRejectsEmptyFile() {
        MockMultipartFile empty = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> service.upload(empty, "x"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("업로드할 파일이 비어 있습니다.");
        verify(s3Client, never()).putObject(any(PutObjectRequest.class), any(RequestBody.class));
    }

    @Test
    @DisplayName("S3 가 S3Exception 을 던지면 IllegalStateException 으로 래핑된다")
    void uploadWrapsS3Exception() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(S3Exception.builder().message("denied").build());

        assertThatThrownBy(() -> service.upload(file, "x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("S3 Storage 업로드에 실패했습니다.");
    }

    @Test
    @DisplayName("S3 가 SdkClientException 을 던지면 IllegalStateException 으로 래핑된다")
    void uploadWrapsSdkClientException() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});
        when(s3Client.putObject(any(PutObjectRequest.class), any(RequestBody.class)))
                .thenThrow(SdkClientException.create("network"));

        assertThatThrownBy(() -> service.upload(file, "x"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("S3 Storage 업로드에 실패했습니다.");
    }
}
