package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.mock.web.MockMultipartFile;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
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
    @DisplayName("directory + UUID 파일명으로 키가 생성되고 확장자는 검증된 Content-Type 에서 도출된다")
    void uploadCallsPutObjectWithDirectoryUuidKey() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "photo.webp", "image/webp", new byte[]{1, 2, 3});

        service.upload(file, "club/cover", "image/webp");

        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().bucket()).isEqualTo("duing");
        assertThat(captor.getValue().key()).matches("club/cover/[0-9a-f-]{36}\\.webp");
    }

    @Test
    @DisplayName("저장 객체의 Content-Type 은 전달된(검증된) Content-Type 으로 설정된다")
    void uploadSetsContentType() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});

        service.upload(file, "club/logo", "image/png");

        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().contentType()).isEqualTo("image/png");
    }

    @Test
    @DisplayName("저장 객체에 Content-Disposition=inline 과 영구 Cache-Control 이 설정된다")
    void uploadSetsContentDispositionAndCacheControl() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});

        service.upload(file, "club/logo", "image/png");

        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().contentDisposition()).isEqualTo("inline");
        assertThat(captor.getValue().cacheControl()).isEqualTo("public, max-age=31536000, immutable");
    }

    @Test
    @DisplayName("저장 확장자는 클라이언트 파일명이 아니라 검증된 Content-Type 에서 도출된다")
    void uploadDerivesExtensionFromContentTypeNotFilename() {
        // 파일명은 .png 지만 검증된 타입이 image/jpeg 이면 저장 키는 .jpg 가 된다.
        MockMultipartFile file = new MockMultipartFile(
                "file", "spoof.png", "image/png", new byte[]{1});

        service.upload(file, "club/cover", "image/jpeg");

        ArgumentCaptor<PutObjectRequest> captor = ArgumentCaptor.forClass(PutObjectRequest.class);
        verify(s3Client).putObject(captor.capture(), any(RequestBody.class));
        assertThat(captor.getValue().key()).matches("club/cover/[0-9a-f-]{36}\\.jpg");
        assertThat(captor.getValue().contentType()).isEqualTo("image/jpeg");
    }

    @Test
    @DisplayName("업로드 성공 시 publicBaseUrl + / + key 형태의 URL 이 반환된다")
    void uploadReturnsPublicUrl() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[]{1});

        String url = service.upload(file, "club/cover", "image/png");

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

        String url = serviceWithSlash.upload(file, "club/cover", "image/png");

        assertThat(url).startsWith("https://files.duing.app/club/cover/")
                .doesNotMatch(".*files\\.duing\\.app//.*");
    }

    @Test
    @DisplayName("파일이 비어 있으면 IllegalArgumentException 이 발생하고 S3 호출이 일어나지 않는다")
    void uploadRejectsEmptyFile() {
        MockMultipartFile empty = new MockMultipartFile(
                "file", "p.png", "image/png", new byte[0]);

        assertThatThrownBy(() -> service.upload(empty, "x", "image/png"))
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

        assertThatThrownBy(() -> service.upload(file, "x", "image/png"))
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

        assertThatThrownBy(() -> service.upload(file, "x", "image/png"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("S3 Storage 업로드에 실패했습니다.");
    }

    @Test
    @DisplayName("공개 URL 에서 key 가 leading slash 없이 추출되어 DeleteObject 가 호출된다")
    void deleteExtractsKeyWithoutLeadingSlash() {
        service.delete("https://files.duing.app/club/cover/abc.webp");

        ArgumentCaptor<software.amazon.awssdk.services.s3.model.DeleteObjectRequest> captor =
                ArgumentCaptor.forClass(software.amazon.awssdk.services.s3.model.DeleteObjectRequest.class);
        verify(s3Client).deleteObject(captor.capture());
        assertThat(captor.getValue().bucket()).isEqualTo("duing");
        assertThat(captor.getValue().key()).isEqualTo("club/cover/abc.webp");
    }

    @Test
    @DisplayName("publicBaseUrl 끝에 슬래시가 있어도 delete 의 prefix 매칭은 정확히 일치한다")
    void deleteHandlesTrailingSlashInBaseUrl() {
        S3StorageProperties propertiesWithSlash = new S3StorageProperties(
                "https://example.com", "auto", "ak", "sk", "duing",
                "https://files.duing.app/");
        S3FileStorageService serviceWithSlash =
                new S3FileStorageService(s3Client, propertiesWithSlash);

        serviceWithSlash.delete("https://files.duing.app/club/cover/abc.webp");

        ArgumentCaptor<software.amazon.awssdk.services.s3.model.DeleteObjectRequest> captor =
                ArgumentCaptor.forClass(software.amazon.awssdk.services.s3.model.DeleteObjectRequest.class);
        verify(s3Client).deleteObject(captor.capture());
        assertThat(captor.getValue().key()).isEqualTo("club/cover/abc.webp");
    }

    @Test
    @DisplayName("publicBaseUrl 과 prefix 가 일치하지 않는 URL 은 삭제 호출 없이 무시된다")
    void deleteIgnoresUrlOutsideBaseUrl() {
        service.delete("https://other-host.example/club/cover/abc.webp");

        verify(s3Client, never()).deleteObject(any(software.amazon.awssdk.services.s3.model.DeleteObjectRequest.class));
    }

    @Test
    @DisplayName("삭제 중 SdkException 이 발생해도 예외가 전파되지 않고 warn 로그만 남는다")
    void deleteSwallowsSdkException() {
        when(s3Client.deleteObject(any(software.amazon.awssdk.services.s3.model.DeleteObjectRequest.class)))
                .thenThrow(software.amazon.awssdk.awscore.exception.AwsServiceException.builder()
                        .message("conflict").build());

        assertThatCode(() -> service.delete("https://files.duing.app/club/cover/abc.webp"))
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("null 또는 빈 URL 은 delete 호출 없이 즉시 반환된다")
    void deleteHandlesNullAndBlank() {
        service.delete(null);
        service.delete("");
        service.delete("   ");

        verify(s3Client, never()).deleteObject(any(software.amazon.awssdk.services.s3.model.DeleteObjectRequest.class));
    }

    @Test
    @DisplayName("publicBaseUrl 프리픽스로 시작하는 URL 은 프리픽스를 벗긴 키를 반환한다")
    void toStorageKeyStripsPublicBaseUrlPrefix() {
        String key = service.toStorageKey("https://files.duing.app/federation/inquiry/abc.webp");

        assertThat(key).isEqualTo("federation/inquiry/abc.webp");
    }

    @Test
    @DisplayName("publicBaseUrl 끝에 슬래시가 있어도 toStorageKey 의 prefix 매칭은 정확히 일치한다")
    void toStorageKeyHandlesTrailingSlashInBaseUrl() {
        S3StorageProperties propertiesWithSlash = new S3StorageProperties(
                "https://example.com", "auto", "ak", "sk", "duing",
                "https://files.duing.app/");
        S3FileStorageService serviceWithSlash = new S3FileStorageService(s3Client, propertiesWithSlash);

        String key = serviceWithSlash.toStorageKey("https://files.duing.app/federation/inquiry/abc.webp");

        assertThat(key).isEqualTo("federation/inquiry/abc.webp");
    }

    @Test
    @DisplayName("publicBaseUrl 과 prefix 가 일치하지 않는 URL 은 null 을 반환한다")
    void toStorageKeyReturnsNullWhenPrefixMismatches() {
        String key = service.toStorageKey("https://other-host.example/federation/inquiry/abc.webp");

        assertThat(key).isNull();
    }

    @Test
    @DisplayName("null 또는 빈 URL 은 toStorageKey 에서 null 을 반환한다")
    void toStorageKeyHandlesNullAndBlank() {
        assertThat(service.toStorageKey(null)).isNull();
        assertThat(service.toStorageKey("")).isNull();
        assertThat(service.toStorageKey("   ")).isNull();
    }

    @Test
    @DisplayName("toFileUrl 은 키 앞에 publicBaseUrl 을 붙여 toStorageKey 의 역변환을 수행한다")
    void toFileUrlReassemblesPublicUrl() {
        String url = service.toFileUrl("federation/inquiry/abc.webp");

        assertThat(url).isEqualTo("https://files.duing.app/federation/inquiry/abc.webp");
        assertThat(service.toStorageKey(url)).isEqualTo("federation/inquiry/abc.webp");
    }

    @Test
    @DisplayName("null 또는 빈 키는 toFileUrl 에서 null 을 반환한다")
    void toFileUrlHandlesNullAndBlank() {
        assertThat(service.toFileUrl(null)).isNull();
        assertThat(service.toFileUrl("")).isNull();
        assertThat(service.toFileUrl("   ")).isNull();
    }

    @Test
    @DisplayName("sizeOf 는 headObject 의 Content-Length 를 그대로 반환한다")
    void sizeOfReturnsContentLengthFromHeadObject() {
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenReturn(HeadObjectResponse.builder().contentLength(2048L).build());

        Long size = service.sizeOf("federation/inquiry/abc.webp");

        assertThat(size).isEqualTo(2048L);
        ArgumentCaptor<HeadObjectRequest> captor = ArgumentCaptor.forClass(HeadObjectRequest.class);
        verify(s3Client).headObject(captor.capture());
        assertThat(captor.getValue().bucket()).isEqualTo("duing");
        assertThat(captor.getValue().key()).isEqualTo("federation/inquiry/abc.webp");
    }

    @Test
    @DisplayName("존재하지 않는 키는 NoSuchKeyException 을 잡아 sizeOf 가 null 을 반환한다")
    void sizeOfReturnsNullWhenKeyDoesNotExist() {
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("no such key").build());

        assertThat(service.sizeOf("federation/inquiry/missing.webp")).isNull();
    }

    @Test
    @DisplayName("일반 SdkException 이 발생해도 sizeOf 는 예외를 전파하지 않고 null 을 반환한다")
    void sizeOfReturnsNullOnSdkException() {
        when(s3Client.headObject(any(HeadObjectRequest.class)))
                .thenThrow(SdkClientException.create("network"));

        assertThat(service.sizeOf("federation/inquiry/abc.webp")).isNull();
    }

    @Test
    @DisplayName("null 또는 빈 키는 sizeOf 에서 headObject 호출 없이 null 을 반환한다")
    void sizeOfHandlesNullAndBlank() {
        assertThat(service.sizeOf(null)).isNull();
        assertThat(service.sizeOf("")).isNull();
        assertThat(service.sizeOf("   ")).isNull();

        verify(s3Client, never()).headObject(any(HeadObjectRequest.class));
    }

    @Test
    @DisplayName("download 는 getObject 응답을 StoredFile 로 감싸 스트림·Content-Type·Content-Length 를 그대로 전달한다")
    void downloadReturnsStoredFileFromGetObject() throws IOException {
        byte[] body = "hello world".getBytes();
        ResponseInputStream<GetObjectResponse> responseStream = new ResponseInputStream<>(
                GetObjectResponse.builder().contentType("image/jpeg").contentLength((long) body.length).build(),
                new ByteArrayInputStream(body));
        when(s3Client.getObject(any(GetObjectRequest.class))).thenReturn(responseStream);

        StoredFile storedFile = service.download("federation/inquiry/abc.jpg");

        assertThat(storedFile).isNotNull();
        assertThat(storedFile.contentType()).isEqualTo("image/jpeg");
        assertThat(storedFile.contentLength()).isEqualTo(body.length);
        assertThat(storedFile.stream().readAllBytes()).isEqualTo(body);

        ArgumentCaptor<GetObjectRequest> captor = ArgumentCaptor.forClass(GetObjectRequest.class);
        verify(s3Client).getObject(captor.capture());
        assertThat(captor.getValue().bucket()).isEqualTo("duing");
        assertThat(captor.getValue().key()).isEqualTo("federation/inquiry/abc.jpg");
    }

    @Test
    @DisplayName("존재하지 않는 키는 NoSuchKeyException 을 잡아 download 가 null 을 반환한다")
    void downloadReturnsNullWhenKeyDoesNotExist() {
        when(s3Client.getObject(any(GetObjectRequest.class)))
                .thenThrow(NoSuchKeyException.builder().message("no such key").build());

        assertThat(service.download("federation/inquiry/missing.jpg")).isNull();
    }

    @Test
    @DisplayName("일반 SdkException 이 발생해도 download 는 예외를 전파하지 않고 null 을 반환한다")
    void downloadReturnsNullOnSdkException() {
        when(s3Client.getObject(any(GetObjectRequest.class)))
                .thenThrow(SdkClientException.create("network"));

        assertThat(service.download("federation/inquiry/abc.jpg")).isNull();
    }

    @Test
    @DisplayName("null 또는 빈 키는 download 에서 getObject 호출 없이 null 을 반환한다")
    void downloadHandlesNullAndBlank() {
        assertThat(service.download(null)).isNull();
        assertThat(service.download("")).isNull();
        assertThat(service.download("   ")).isNull();

        verify(s3Client, never()).getObject(any(GetObjectRequest.class));
    }
}
