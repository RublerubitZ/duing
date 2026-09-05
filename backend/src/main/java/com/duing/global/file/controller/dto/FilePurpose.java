package com.duing.global.file.controller.dto;

/**
 * 업로드 API 의 용도 — 스토리지 디렉터리를 결정한다.
 *
 * <p><b>유지 규칙(#791)</b>: purpose 를 추가하면 (1) 업로드 URL 을 저장하는 도메인 쓰기 메서드에서
 * {@code UploadedObjectService.activate}(본문이면 {@code activateReferencedIn})를 호출하고,
 * (2) {@code UploadedObjectRepository.isReferenced} 의 참조 스캔에 그 저장 위치를 추가해야 한다.
 * 둘 다 빠지면 24시간 뒤 파기 잡이 실사용 객체를 지운다(참조 스캔이 있으면 WARN 으로 대신 잡힌다).
 */
public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo"),
    NOTICE_COVER("notice/cover"),
    NOTICE_BODY("notice/body"),
    PROMOTION_BANNER("promotion/banner"),
    GLOBAL_EVENT_COVER("global-event/cover"),
    PROMOTION_REQUEST_BANNER("promotion-request/banner"),
    FEDERATION_INQUIRY("federation/inquiry");

    private final String directory;

    FilePurpose(String directory) {
        this.directory = directory;
    }

    public String directory() {
        return directory;
    }
}
