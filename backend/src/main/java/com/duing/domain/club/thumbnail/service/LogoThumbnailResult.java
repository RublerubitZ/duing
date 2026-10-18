package com.duing.domain.club.thumbnail.service;

/** 썸네일 생성 결과(스펙 §4.2) — 만든 바이트·형식, 원본 URL 을 그대로 쓰는 경우(사유), 건너뜀(사유)을 구분한다. */
public sealed interface LogoThumbnailResult {

    LogoThumbnailResult USE_ORIGINAL = new UseOriginal(UseOriginalReason.SMALL_ORIGINAL);

    /** 리사이즈한 썸네일 바이트 — contentType 은 image/png(알파 있음) 또는 image/jpeg(알파 없음). */
    record Generated(byte[] bytes, String contentType) implements LogoThumbnailResult {
    }

    /** 새 객체 없이 원본 URL 을 썸네일로 쓴다(확대·재인코딩 없음). */
    record UseOriginal(UseOriginalReason reason) implements LogoThumbnailResult {
    }

    /** 만들지 않는다 — 썸네일은 NULL 로 두고 클라이언트가 원본을 쓴다. */
    record Skipped(SkipReason reason) implements LogoThumbnailResult {
    }

    enum UseOriginalReason {
        /** 원본 긴 변이 이미 상한 이하. */
        SMALL_ORIGINAL,
        /** sRGB 가 아닌 RGB ICC 프로파일(Display P3 같은 넓은 색역 등)이 붙었다 — 이 생성기는 프로파일을 옮기지 않아 다시 쓰면 색이 달라진다. */
        NON_SRGB_PROFILE
    }

    enum SkipReason {
        /** ImageIO 가 읽는 형식이 아니다(WebP 등). */
        UNSUPPORTED_FORMAT,
        /** 디코딩 실패(손상 파일, JDK 가 못 읽는 JPEG 변형(산술 부호화·12비트) 등. CMYK·YCCK JPEG 는 JDK 21 이 디코딩한다). */
        UNREADABLE,
        /** 치수가 상한(픽셀 수 베이스라인 2,500만·프로그레시브·다중 스캔 JPEG 800만, 긴 변 16,384px)을 넘는다 — 디코딩 전에 끊는다. */
        TOO_MANY_PIXELS,
        /** EXIF 방향이 정방향(1)이 아닌 JPEG — ImageIO 는 방향을 적용하지 않아 썸네일이 돌아간다. */
        EXIF_ORIENTATION
    }
}
