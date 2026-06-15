package com.duing.global.file;

import org.springframework.web.multipart.MultipartFile;

public interface FileStorageService {

    /**
     * 파일을 저장하고 공개 URL 을 반환한다.
     *
     * @param contentType 매직 바이트로 검증된 MIME 타입. 저장 객체의 Content-Type 과 확장자는
     *                    클라이언트가 보낸 헤더·파일명이 아니라 이 값에서 도출한다.
     */
    String upload(MultipartFile file, String directory, String contentType);

    void delete(String fileUrl);
}
