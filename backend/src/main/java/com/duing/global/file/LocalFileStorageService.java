package com.duing.global.file;

import java.io.FileInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@ConditionalOnProperty(name = "file.storage.provider", havingValue = "local", matchIfMissing = true)
public class LocalFileStorageService implements FileStorageService {

    private final Path rootDir;
    private final String baseUrl;

    public LocalFileStorageService(
            @Value("${file.upload-dir}") String uploadDir,
            @Value("${file.local.base-url:}") String baseUrl) {
        this.rootDir = Paths.get(uploadDir).toAbsolutePath().normalize();
        this.baseUrl = stripTrailingSlash(baseUrl);
        try {
            Files.createDirectories(this.rootDir);
        } catch (IOException exception) {
            throw new IllegalStateException("파일 저장 디렉터리를 생성할 수 없습니다: " + this.rootDir, exception);
        }
        log.warn("Active storage backend = LOCAL (root={})", this.rootDir);
    }

    private static String stripTrailingSlash(String url) {
        if (url == null || url.isBlank()) {
            return "";
        }
        return url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
    }

    // upload() 가 반환하는 URL 은 항상 이 프리픽스 + "{directory}/{storedFilename}" 형태다.
    private String filesPrefix() {
        return baseUrl + "/files/";
    }

    @Override
    public String upload(MultipartFile file, String directory, String contentType) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
        }
        try {
            Path targetDir = rootDir.resolve(directory).normalize();
            Files.createDirectories(targetDir);

            String extension = FileUploadPolicy.EXTENSION_BY_MIME.getOrDefault(contentType, "bin");
            String storedFilename = UUID.randomUUID() + "." + extension;

            Path destination = targetDir.resolve(storedFilename);
            file.transferTo(destination);

            // baseUrl 이 비어 있으면 상대 경로로 폴백 (기존 동작 호환).
            return baseUrl + "/files/" + directory + "/" + storedFilename;
        } catch (IOException exception) {
            throw new IllegalStateException("파일 저장에 실패했습니다.", exception);
        }
    }

    @Override
    public boolean delete(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return false;
        }
        try {
            // 절대 URL (`http://.../files/...`) 과 상대 경로 (`/files/...`) 모두 지원.
            int filesIndex = fileUrl.indexOf("/files/");
            String relative = filesIndex >= 0
                    ? fileUrl.substring(filesIndex + "/files/".length())
                    : fileUrl;
            Path target = rootDir.resolve(relative).normalize();
            if (!target.startsWith(rootDir)) {
                // rootDir 밖(경로 탈출)은 이 구현이 관리하지 않는 경로 — 삭제 확정 불가.
                return false;
            }
            // 삭제 성공·파일 부재 모두 "객체가 더 이상 없음" = 삭제 확정(멱등).
            Files.deleteIfExists(target);
            return true;
        } catch (IOException exception) {
            log.warn("파일 삭제 실패: {}", fileUrl, exception);
            return false;
        }
    }

    @Override
    public String toStorageKey(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return null;
        }
        String prefix = filesPrefix();
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
        return filesPrefix() + storageKey;
    }

    @Override
    public Long sizeOf(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return null;
        }
        Path target = rootDir.resolve(storageKey).normalize();
        if (!target.startsWith(rootDir) || !Files.isRegularFile(target)) {
            return null;
        }
        try {
            return Files.size(target);
        } catch (IOException exception) {
            // 존재 확인(isRegularFile)을 이미 통과했으므로 여기서의 IOException 은 "미존재"가 아니라
            // 실제 I/O 장애(권한 등) — S3 sizeOf 의 SdkException 전파와 동일한 원칙으로 전파한다.
            throw new IllegalStateException("파일 크기 조회에 실패했습니다: " + storageKey, exception);
        }
    }

    @Override
    public StoredFile download(String storageKey) {
        if (storageKey == null || storageKey.isBlank()) {
            return null;
        }
        // 경로 탈출 가드 — "../../etc/passwd" 등이 rootDir 밖을 가리키면 정규화 후에도
        // rootDir 프리픽스를 벗어나므로 여기서 걸러낸다.
        Path resolved = rootDir.resolve(storageKey).normalize();
        if (!resolved.startsWith(rootDir) || !Files.isRegularFile(resolved)) {
            return null;
        }
        try {
            long contentLength = Files.size(resolved);
            return new StoredFile(new FileInputStream(resolved.toFile()), resolveContentType(storageKey), contentLength);
        } catch (IOException exception) {
            // sizeOf 와 동일한 원칙 — 존재 확인 통과 후의 IOException 은 실제 I/O 장애이므로 전파한다.
            throw new IllegalStateException("파일 다운로드에 실패했습니다: " + storageKey, exception);
        }
    }

    // 로컬 저장소는 S3 객체 메타데이터 같은 별도 Content-Type 저장소가 없으므로, 업로드 시점과
    // 동일하게 저장 확장자(FileUploadPolicy.EXTENSION_BY_MIME 로 부여됨)로부터 안전하게 복원한다.
    private String resolveContentType(String storageKey) {
        int dotIndex = storageKey.lastIndexOf('.');
        String extension = dotIndex >= 0 ? storageKey.substring(dotIndex + 1).toLowerCase() : "";
        return FileUploadPolicy.MIME_BY_EXTENSION.getOrDefault(extension, "application/octet-stream");
    }
}
