package com.duing.global.file;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Slf4j
@Service
@Profile("local")
public class LocalFileStorageService implements FileStorageService {

    private final Path rootDir;

    public LocalFileStorageService(@Value("${file.upload-dir}") String uploadDir) {
        this.rootDir = Paths.get(uploadDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.rootDir);
        } catch (IOException exception) {
            throw new IllegalStateException("파일 저장 디렉터리를 생성할 수 없습니다: " + this.rootDir, exception);
        }
    }

    @Override
    public String upload(MultipartFile file, String directory) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("업로드할 파일이 비어 있습니다.");
        }
        try {
            Path targetDir = rootDir.resolve(directory).normalize();
            Files.createDirectories(targetDir);

            String originalFilename = StringUtils.cleanPath(
                    file.getOriginalFilename() == null ? "file" : file.getOriginalFilename());
            String extension = StringUtils.getFilenameExtension(originalFilename);
            String storedFilename = UUID.randomUUID() + (extension != null ? "." + extension : "");

            Path destination = targetDir.resolve(storedFilename);
            file.transferTo(destination);

            return "/files/" + directory + "/" + storedFilename;
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
            String relative = fileUrl.startsWith("/files/") ? fileUrl.substring("/files/".length()) : fileUrl;
            Path target = rootDir.resolve(relative).normalize();
            if (target.startsWith(rootDir)) {
                Files.deleteIfExists(target);
            }
        } catch (IOException exception) {
            log.warn("파일 삭제 실패: {}", fileUrl, exception);
        }
    }
}
