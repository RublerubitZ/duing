package com.duing.global.file;

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
    public void delete(String fileUrl) {
        if (fileUrl == null || fileUrl.isBlank()) {
            return;
        }
        try {
            // 절대 URL (`http://.../files/...`) 과 상대 경로 (`/files/...`) 모두 지원.
            int filesIndex = fileUrl.indexOf("/files/");
            String relative = filesIndex >= 0
                    ? fileUrl.substring(filesIndex + "/files/".length())
                    : fileUrl;
            Path target = rootDir.resolve(relative).normalize();
            if (target.startsWith(rootDir)) {
                Files.deleteIfExists(target);
            }
        } catch (IOException exception) {
            log.warn("파일 삭제 실패: {}", fileUrl, exception);
        }
    }
}
