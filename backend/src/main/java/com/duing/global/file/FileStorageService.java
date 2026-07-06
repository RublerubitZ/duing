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

    /**
     * 공개 URL 에서 스토리지 키를 추출한다.
     *
     * <p>비밀 첨부(총동연 문의 등)는 DB 에 공개 URL 이 아닌 스토리지 키만 저장해야 한다 — URL 을
     * 그대로 저장·응답에 노출하면 인증 없이 원본에 직접 접근할 수 있어 비밀성이 깨진다. 업로드
     * 직후 돌려받은 URL 을 이 메서드로 키로 변환해 저장하고, 응답에는 키 대신 파생 메타데이터만
     * 내려준다.
     *
     * @param fileUrl 업로드 API({@code POST /api/v1/files})가 반환한 공개 URL
     * @return 이 스토리지 구현의 공개 base 프리픽스로 시작하면 벗겨낸 키, 프리픽스가 다르거나
     * (타 스토리지 URL·형식 불일치) 값이 비어 있으면 {@code null}
     */
    String toStorageKey(String fileUrl);
}
