package com.duing.common;

import com.duing.global.file.FileStorageService;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * test 프로파일 전용 FileStorageService no-op 구현.
 *
 * <p>{@code file.storage.provider=stub} (test/application.yml 에 명시) 일 때 활성.
 * Local/S3 둘 다 같은 property 스위치를 쓰므로 동시 등록 충돌 없음.
 *
 * <p>upload/delete 는 실제 I/O 없이 가짜 URL 만 반환·반응 없음.
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
    public void delete(String fileUrl) {
        // no-op
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
}
