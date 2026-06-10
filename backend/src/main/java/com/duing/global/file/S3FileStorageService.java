package com.duing.global.file;

import java.io.IOException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
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
    public String upload(MultipartFile file, String directory) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
        }
        String originalFilename = StringUtils.cleanPath(
                file.getOriginalFilename() == null ? "file" : file.getOriginalFilename());
        String extension = StringUtils.getFilenameExtension(originalFilename);
        String key = directory + "/" + UUID.randomUUID()
                + (extension != null ? "." + extension : "");

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
                            .contentType(resolveContentType(file.getContentType()))
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

    private static String resolveContentType(String value) {
        if (value == null || value.isBlank()) {
            return "application/octet-stream";
        }
        return value;
    }
}
