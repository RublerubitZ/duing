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

    @Override
    public String upload(MultipartFile file, String directory, String contentType) {
        String name = file == null ? "null" : file.getOriginalFilename();
        return "/files/stub/" + directory + "/" + name;
    }

    @Override
    public void delete(String fileUrl) {
        // no-op
    }
}
