package com.duing.global.file;

import java.io.IOException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.HeadObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

/**
 * S3 호환 스토리지(R2 / MinIO / AWS S3) 파일 저장 구현.
 *
 * <p>활성화는 {@code file.storage.provider=s3} 조건. 구체적인 백엔드(R2 vs MinIO 등)는
 * {@code s3.endpoint} 가 결정. 인터페이스 반환은 full URL 로 통일 (기존 Local 동작 호환).
 *
 * <p>업로드 body 는 {@link RequestBody#fromBytes(byte[])} 사용. AWS SDK v2 가 서명/재시도
 * 시 body 를 재읽기 하므로 non-resettable InputStream 은 간헐적 실패 위험. 5MB 상한이라
 * byte[] 전체 적재 안전.
 *
 * <p>저장형 XSS 방어: 매직바이트로 검증된 이미지 MIME 만 Content-Type 으로 박고(클라이언트 헤더
 * 무시), Content-Disposition=inline 으로 둔다. 다만 매직바이트는 polyglot(유효 헤더+HTML 페이로드)을
 * 걸러내지 못하므로, 공개 CDN(R2) 가 직접 서빙할 때 브라우저 MIME 스니핑을 막는
 * {@code X-Content-Type-Options: nosniff} 응답 헤더를 <b>R2/Cloudflare 엣지(Transform Rule)에서</b>
 * 추가해야 한다 — S3 PutObject 메타데이터로는 이 응답 헤더를 emit 할 수 없다(배포 체크리스트 항목).
 */
@Slf4j
@Service
@ConditionalOnProperty(name = "file.storage.provider", havingValue = "s3")
public class S3FileStorageService implements FileStorageService {

    private final S3Client s3Client;
    private final S3StorageProperties properties;

    public S3FileStorageService(S3Client s3Client, S3StorageProperties properties) {
        this.s3Client = s3Client;
        this.properties = properties;
        log.info("Active storage backend = S3 (endpoint={}, bucket={})",
                properties.endpoint(), properties.bucket());
    }

    @Override
    public String upload(MultipartFile file, String directory, String contentType) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
        }
        String extension = FileUploadPolicy.EXTENSION_BY_MIME.getOrDefault(contentType, "bin");
        String sanitizedDirectory = StringUtils.cleanPath(directory);
        String key = sanitizedDirectory + "/" + UUID.randomUUID() + "." + extension;

        byte[] body;
        try {
            body = file.getBytes();
        } catch (IOException exception) {
            throw new IllegalStateException("파일을 읽지 못했습니다.", exception);
        }

        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(properties.bucket())
                            .key(key)
                            .contentType(contentType)
                            // inline 유지(로고/커버/아바타가 <img> 로 렌더되어야 함). Content-Type 이
                            // 이미지로 고정돼 있어 직접 탐색 시 HTML 로 실행되지 않는다.
                            .contentDisposition("inline")
                            // UUID 키는 덮어쓰지 않으므로 영구 캐시 가능.
                            .cacheControl("public, max-age=31536000, immutable")
                            .build(),
                    RequestBody.fromBytes(body));
        } catch (SdkException exception) {
            log.error("S3 Storage 업로드 실패: bucket={}, key={}",
                    properties.bucket(), key, exception);
            throw new IllegalStateException("S3 Storage 업로드에 실패했습니다.", exception);
        }

        return properties.publicBaseUrl() + "/" + key;
    }

    @Override
    public void delete(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return;
        }
        String prefix = properties.publicBaseUrl() + "/";
        if (!fileUrl.startsWith(prefix)) {
            log.warn("외부 storage URL 스킵 — prefix 불일치");
            return;
        }
        String key = fileUrl.substring(prefix.length());

        try {
            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(key)
                    .build());
        } catch (SdkException exception) {
            log.warn("S3 Storage 삭제 실패: key={}", key, exception);
        }
    }

    @Override
    public String toStorageKey(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return null;
        }
        String prefix = properties.publicBaseUrl() + "/";
        if (!fileUrl.startsWith(prefix)) {
            return null;
        }
        return fileUrl.substring(prefix.length());
    }

    @Override
    public String toFileUrl(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return null;
        }
        return properties.publicBaseUrl() + "/" + storageKey;
    }

    @Override
    public Long sizeOf(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return null;
        }
        try {
            HeadObjectResponse response = s3Client.headObject(HeadObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(storageKey)
                    .build());
            return response.contentLength();
        } catch (NoSuchKeyException notFound) {
            return null;
        } catch (SdkException exception) {
            log.warn("S3 Storage 크기 조회 실패: key={}", storageKey, exception);
            return null;
        }
    }

    @Override
    public StoredFile download(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return null;
        }
        try {
            // try-with-resources 금지 — 이 스트림은 컨트롤러가 HTTP 응답으로 그대로 흘려보낸 뒤
            // 소비 완료 시점에 닫는다. 여기서 닫으면 응답 본문이 비게 된다.
            ResponseInputStream<GetObjectResponse> objectStream = s3Client.getObject(GetObjectRequest.builder()
                    .bucket(properties.bucket())
                    .key(storageKey)
                    .build());
            GetObjectResponse metadata = objectStream.response();
            return new StoredFile(objectStream, metadata.contentType(), metadata.contentLength());
        } catch (NoSuchKeyException notFound) {
            return null;
        } catch (SdkException exception) {
            log.warn("S3 Storage 다운로드 실패: key={}", storageKey, exception);
            return null;
        }
    }
}
