package com.duing.common;

import com.duing.global.file.FileStorageService;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * test 프로파일 전용 FileStorageService no-op 구현.
 *
 * <p>main 의 LocalFileStorageService 는 @Profile("local"), SupabaseStorageFileStorageService 는
 * `file.storage.provider=supabase` 조건이라 test 프로파일에선 둘 다 비활성. FileController 가
 * FileStorageService 의존성을 요구하므로 컨텍스트 부팅을 위해 이 stub 를 제공한다.
 *
 * <p>upload/delete 는 실제 I/O 없이 가짜 URL 만 반환·반응 없음.
 */
@Service
@Profile("test")
public class StubFileStorageService implements FileStorageService {

    @Override
    public String upload(MultipartFile file, String directory) {
        String name = file == null ? "null" : file.getOriginalFilename();
        return "/files/stub/" + directory + "/" + name;
    }

    @Override
    public void delete(String fileUrl) {
        // no-op
    }
}
