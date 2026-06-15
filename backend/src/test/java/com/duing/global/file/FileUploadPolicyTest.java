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
    @DisplayName("이미지가 아닌 바이트(HTML/임의/빈/null/짧음)는 null 로 거부된다")
    void rejectsNonImageBytes() {
        assertThat(FileUploadPolicy.detectImageContentType("<html><script>".getBytes())).isNull();
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
}
