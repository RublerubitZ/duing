package com.duing.global.file;

import org.springframework.web.multipart.MultipartFile;

public interface FileStorageService {

    String upload(MultipartFile file, String directory);

    void delete(String fileUrl);
}
