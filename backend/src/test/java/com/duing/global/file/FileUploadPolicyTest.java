package com.duing.global.file;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FileUploadPolicyTest {

    @Test
    @DisplayName("JPEG/PNG/WEBP 매직 바이트는 해당 MIME 으로 판별된다")
    void detectsAllowedImageSignatures() {
        assertThat(FileUploadPolicy.detectImageContentType(
                new byte[]{(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0}))
                .isEqualTo("image/jpeg");
        assertThat(FileUploadPolicy.detectImageContentType(
                new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}))
                .isEqualTo("image/png");
        byte[] webp = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'};
        assertThat(FileUploadPolicy.detectImageContentType(webp)).isEqualTo("image/webp");
    }

    @Test
    @DisplayName("이미지가 아닌 바이트(HTML/SVG/임의/빈/null/짧음)는 null 로 거부된다")
    void rejectsNonImageBytes() {
        assertThat(FileUploadPolicy.detectImageContentType("<html><script>".getBytes())).isNull();
        // SVG 는 스크립트 실행이 가능한 XML 문서라 이미지로 받아주면 저장형 XSS 가 된다.
        assertThat(FileUploadPolicy.detectImageContentType(
                "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".getBytes()))
                .isNull();
        assertThat(FileUploadPolicy.detectImageContentType(
                "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"/>".getBytes()))
                .isNull();
        assertThat(FileUploadPolicy.detectImageContentType(new byte[]{0x00, 0x01, 0x02, 0x03})).isNull();
        assertThat(FileUploadPolicy.detectImageContentType(new byte[0])).isNull();
        assertThat(FileUploadPolicy.detectImageContentType(null)).isNull();
        // RIFF 컨테이너지만 WEBP 가 아닌 경우(예: WAV)는 거부된다.
        byte[] riffWav = {'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'A', 'V', 'E'};
        assertThat(FileUploadPolicy.detectImageContentType(riffWav)).isNull();
    }

    @Test
    @DisplayName("검증된 MIME 은 저장 확장자로 매핑된다")
    void mapsMimeToExtension() {
        assertThat(FileUploadPolicy.EXTENSION_BY_MIME)
                .containsEntry("image/jpeg", "jpg")
                .containsEntry("image/png", "png")
                .containsEntry("image/webp", "webp");
    }

    @Test
    @DisplayName("로그용 Content-Type 정제는 개행·제어문자를 치환해 로그 라인 위조를 막는다")
    void sanitizesContentTypeAgainstLogInjection() {
        // CRLF 로 가짜 로그 라인을 덧붙이는 전형적 로그 인젝션 — 개행이 "_" 로 치환되어 한 줄로 남는다.
        assertThat(FileUploadPolicy.sanitizeContentTypeForLog("image/png\r\nWARN fake-line"))
                .isEqualTo("image/png__WARN_fake-line");
        // ANSI 이스케이프(터미널 제어)도 허용 문자가 아니므로 치환된다.
        assertThat(FileUploadPolicy.sanitizeContentTypeForLog("\u001b[31mimage/png"))
                .isEqualTo("__31mimage/png");
        assertThat(FileUploadPolicy.sanitizeContentTypeForLog("image/jpeg")).isEqualTo("image/jpeg");
    }

    @Test
    @DisplayName("로그용 Content-Type 정제는 64자로 자르고 null/공백은 none 으로 기록한다")
    void truncatesAndDefaultsSanitizedContentType() {
        assertThat(FileUploadPolicy.sanitizeContentTypeForLog("a".repeat(100)))
                .isEqualTo("a".repeat(64));
        assertThat(FileUploadPolicy.sanitizeContentTypeForLog(null)).isEqualTo("none");
        assertThat(FileUploadPolicy.sanitizeContentTypeForLog("   ")).isEqualTo("none");
    }
}
