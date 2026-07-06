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

    /**
     * 스토리지 키를 공개 URL 로 재조립한다({@link #toStorageKey} 의 역변환).
     *
     * <p>비밀 첨부를 교체할 때 목록에서 제거된 객체를 물리적으로 정리하려면 기존
     * {@link #delete(String)}(URL 기반)를 호출해야 하는데, DB 에는 키만 저장돼 있으므로
     * 삭제 직전에만 이 메서드로 URL 을 복원한다.
     */
    String toFileUrl(String storageKey);

    /**
     * 스토리지 키에 대응하는 객체의 실제 바이트 크기를 조회한다.
     *
     * <p>비밀 첨부는 업로드 API 가 반환한 URL 만 전달받으므로, 표시용 메타데이터(file_size)를
     * 클라이언트 입력이 아니라 스토리지 실측값으로 채워 신뢰도를 확보한다. 부수적으로 키에
     * 대응하는 객체가 실제로 존재하는지 확인하는 역할도 겸한다.
     *
     * @return 객체가 존재하면 바이트 크기, 존재하지 않으면 {@code null}
     */
    Long sizeOf(String storageKey);

    /**
     * 스토리지 키에 대응하는 객체를 스트림으로 조회한다 — 인증 프록시 다운로드 전용.
     *
     * <p>호출측(서비스)이 권한 검증(작성자 본인 또는 ADMIN 등)을 이미 마친 뒤에만 호출해야 한다 —
     * 이 메서드 자체는 권한을 검사하지 않는다. 반환된 {@link StoredFile#stream()} 은 HTTP 응답에서
     * 소비 후 닫힌다 — 이 메서드가 미리 닫지 않는다.
     *
     * @return 키에 대응하는 객체가 존재하면 {@link StoredFile}, 존재하지 않으면 {@code null}(호출측이 404 결정)
     */
    StoredFile download(String storageKey);
}
