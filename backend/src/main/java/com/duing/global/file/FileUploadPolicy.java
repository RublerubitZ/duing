package com.duing.global.file;

import java.util.Map;
import java.util.Set;

public final class FileUploadPolicy {

    public static final long MAX_BYTES = 5L * 1024 * 1024;

    public static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp"
    );

    /** 검증된 MIME 타입 → 저장 파일 확장자. 클라이언트가 보낸 파일명 확장자 대신 이 값을 사용한다. */
    public static final Map<String, String> EXTENSION_BY_MIME = Map.of(
            "image/jpeg", "jpg",
            "image/png", "png",
            "image/webp", "webp"
    );

    /**
     * 저장 파일 확장자 → 검증된 MIME 타입 (EXTENSION_BY_MIME 의 역방향).
     *
     * <p>스토리지 키만 아는 상황(비밀 첨부 등 URL 을 저장하지 않는 도메인)에서, 업로드 시
     * 매직바이트로 이미 검증됐던 Content-Type 을 키의 확장자로부터 안전하게 복원할 때 쓴다 —
     * 확장자는 이 정책의 upload 경로에서만 부여되므로 값이 항상 이 맵의 키 중 하나와 일치한다.
     */
    public static final Map<String, String> MIME_BY_EXTENSION = Map.of(
            "jpg", "image/jpeg",
            "png", "image/png",
            "webp", "image/webp"
    );

    /**
     * 파일 선두 바이트(매직 넘버)로 실제 이미지 형식을 판별한다. 허용 형식이 아니면 null 을 반환한다.
     * 클라이언트가 보낸 Content-Type 헤더는 위조 가능하므로 신뢰하지 않고 바이트로 직접 판별한다.
     */
    public static String detectImageContentType(byte[] header) {
        if (header == null) {
            return null;
        }
        if (matches(header, 0xFF, 0xD8, 0xFF)) {
            return "image/jpeg";
        }
        if (matches(header, 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) {
            return "image/png";
        }
        if (isWebp(header)) {
            return "image/webp";
        }
        return null;
    }

    /**
     * 업로드 거부 사유 로그에 남길 클라이언트 Content-Type 을 정제한다. 사용자 제어 값이므로
     * 개행·제어문자로 로그 라인을 위조하는 로그 인젝션을 막기 위해 MIME 문법에 쓰이는 문자만
     * 남기고(나머지는 "_" 치환) 64자로 자른다. 거부 로그에는 파일명·파일 내용을 남기지 않는다.
     */
    public static String sanitizeContentTypeForLog(String claimedContentType) {
        if (claimedContentType == null || claimedContentType.isBlank()) {
            return "none";
        }
        String sanitized = claimedContentType.replaceAll("[^A-Za-z0-9/.+\\-]", "_");
        return sanitized.length() > 64 ? sanitized.substring(0, 64) : sanitized;
    }

    private static boolean matches(byte[] data, int... signature) {
        if (data.length < signature.length) {
            return false;
        }
        for (int index = 0; index < signature.length; index++) {
            if ((data[index] & 0xFF) != signature[index]) {
                return false;
            }
        }
        return true;
    }

    // WEBP 컨테이너: "RIFF"(0~3) + 파일 크기(4~7) + "WEBP"(8~11)
    private static boolean isWebp(byte[] data) {
        return data.length >= 12
                && data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F'
                && data[8] == 'W' && data[9] == 'E' && data[10] == 'B' && data[11] == 'P';
    }

    private FileUploadPolicy() {
    }
}
