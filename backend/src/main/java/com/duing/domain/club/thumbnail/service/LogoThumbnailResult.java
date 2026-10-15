package com.duing.domain.club.thumbnail.service;

/** 썸네일 생성 결과(스펙 §4.2) — 만든 바이트·형식, 원본이 이미 작아 원본 URL 을 쓰는 경우, 건너뜀(사유)을 구분한다. */
public sealed interface LogoThumbnailResult {

    LogoThumbnailResult USE_ORIGINAL = new UseOriginal();

    /** 리사이즈한 썸네일 바이트 — contentType 은 image/png(알파 있음) 또는 image/jpeg(알파 없음). */
    record Generated(byte[] bytes, String contentType) implements LogoThumbnailResult {
    }

    /** 원본 긴 변이 이미 상한 이하 — 새 객체 없이 원본 URL 을 썸네일로 쓴다(확대·재인코딩 없음). */
    record UseOriginal() implements LogoThumbnailResult {
    }

    /** 만들지 않는다 — 썸네일은 NULL 로 두고 클라이언트가 원본을 쓴다. */
    record Skipped(SkipReason reason) implements LogoThumbnailResult {
    }

    enum SkipReason {
        /** ImageIO 가 읽는 형식이 아니다(WebP 등). */
        UNSUPPORTED_FORMAT,
        /** 디코딩 실패(CMYK JPEG·손상 파일 등). */
        UNREADABLE,
        /** 치수가 픽셀 상한(베이스라인 2,500만·프로그레시브 JPEG 800만)을 넘는다 — 디코딩 전에 끊는다. */
        TOO_MANY_PIXELS,
        /** EXIF 방향이 정방향(1)이 아닌 JPEG — ImageIO 는 방향을 적용하지 않아 썸네일이 돌아간다. */
        EXIF_ORIENTATION
    }
}
