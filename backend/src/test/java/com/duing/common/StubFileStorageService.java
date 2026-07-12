package com.duing.common;

import com.duing.global.file.FileStorageService;
import com.duing.global.file.FileUploadPolicy;
import com.duing.global.file.StoredFile;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * test 프로파일 전용 FileStorageService no-op 구현.
 *
 * <p>{@code file.storage.provider=stub} (test/application.yml 에 명시) 일 때 활성.
 * Local/S3 둘 다 같은 property 스위치를 쓰므로 동시 등록 충돌 없음.
 *
 * <p>upload/delete 는 실제 I/O 없이 가짜 URL 반환·삭제 확정(true) 응답만 한다.
 */
@Service
@ConditionalOnProperty(name = "file.storage.provider", havingValue = "stub")
public class StubFileStorageService implements FileStorageService {

    private static final String PREFIX = "/files/stub/";

    @Override
    public String upload(MultipartFile file, String directory, String contentType) {
        String name = file == null ? "null" : file.getOriginalFilename();
        return PREFIX + directory + "/" + name;
    }

    @Override
    public boolean delete(String fileUrl) {
        // 실제 I/O 없는 stub — 항상 삭제 확정으로 응답한다.
        return true;
    }

    @Override
    public String toStorageKey(String fileUrl) {
        if (fileUrl == null || !fileUrl.startsWith(PREFIX)) {
            return null;
        }
        return fileUrl.substring(PREFIX.length());
    }

    @Override
    public String toFileUrl(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return null;
        }
        return PREFIX + storageKey;
    }

    // 실제 존재하지 않는 키(위조된 URL 등)를 흉내내기 위한 테스트 전용 sentinel.
    private static final String MISSING_MARKER = "__missing__";

    @Override
    public Long sizeOf(String storageKey) {
        // 실제 I/O 없는 stub — 존재 여부를 추적하지 않으므로, sentinel 이 없는 한 유효한 키 형식이면
        // 고정 크기를 반환한다. sentinel 포함 키는 "스토리지에 실체가 없는 키" 분기를 테스트하기 위한 것.
        if (storageKey == null || storageKey.isBlank() || storageKey.contains(MISSING_MARKER)) {
            return null;
        }
        return 1024L;
    }

    // 실제 I/O 없는 stub — 다운로드 인수 테스트가 소비할 더미 바이트만 흘려보낸다.
    @Override
    public StoredFile download(String storageKey) {
        if (storageKey == null || storageKey.isBlank() || storageKey.contains(MISSING_MARKER)) {
            return null;
        }
        byte[] content = ("stub-file-content:" + storageKey).getBytes(StandardCharsets.UTF_8);
        return new StoredFile(new ByteArrayInputStream(content), resolveContentType(storageKey), content.length);
    }

    // Local 구현과 동일하게 저장 확장자로부터 Content-Type 을 복원한다(실제 스토리지 메타데이터가 없으므로).
    private String resolveContentType(String storageKey) {
        int dotIndex = storageKey.lastIndexOf('.');
        String extension = dotIndex >= 0 ? storageKey.substring(dotIndex + 1).toLowerCase() : "";
        return FileUploadPolicy.MIME_BY_EXTENSION.getOrDefault(extension, "application/octet-stream");
    }
}
