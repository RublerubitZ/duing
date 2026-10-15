package com.duing.domain.club.thumbnail.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.duing.common.fixture.ImageFixture;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.Generated;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.SkipReason;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.Skipped;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.UseOriginal;
import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class LogoThumbnailGeneratorTest {

    private static BufferedImage decode(Generated generated) throws IOException {
        return ImageIO.read(new ByteArrayInputStream(generated.bytes()));
    }

    private static Generated generated(byte[] source) {
        LogoThumbnailResult result = LogoThumbnailGenerator.generate(source);
        assertThat(result).isInstanceOf(Generated.class);
        return (Generated) result;
    }

    private static SkipReason skipReason(byte[] source) {
        LogoThumbnailResult result = LogoThumbnailGenerator.generate(source);
        assertThat(result).isInstanceOf(Skipped.class);
        return ((Skipped) result).reason();
    }

    @Test
    @DisplayName("알파가 있는 큰 PNG 는 긴 변 384·비율 유지의 PNG 썸네일이 되고 알파 채널이 남는다")
    void alphaPngBecomesPngThumbnailKeepingRatio() throws IOException {
        Generated generated = generated(ImageFixture.png(800, 600, true));

        assertThat(generated.contentType()).isEqualTo("image/png");
        assertThat(generated.bytes()).startsWith((byte) 0x89, (byte) 'P', (byte) 'N', (byte) 'G');
        BufferedImage thumbnail = decode(generated);
        assertThat(thumbnail.getWidth()).isEqualTo(384);
        assertThat(thumbnail.getHeight()).isEqualTo(288);
        assertThat(thumbnail.getColorModel().hasAlpha()).isTrue();
        assertThat(thumbnail.getRGB(0, thumbnail.getHeight() / 2) >>> 24).isLessThan(16); // 왼쪽 끝은 원본처럼 거의 투명
    }

    @ParameterizedTest(name = "sixteenBit={0}")
    @ValueSource(booleans = {false, true})
    @DisplayName("회색+알파 PNG 는 밝기가 그대로인 PNG 썸네일이 되고(회색 128 → 128) 투명한 곳은 투명하게 남는다(8·16비트)")
    void grayAlphaPngKeepsBrightness(boolean sixteenBit) throws IOException {
        byte[] source = ImageFixture.grayAlphaPng(800, 600, 128, sixteenBit);
        // 픽스처가 실제로 회색 색 공간+알파로 읽히는지 — 아니면 이 테스트는 고친 경로를 지나지 않는다
        assertThat(ImageIO.read(new ByteArrayInputStream(source)).getColorModel().getColorSpace().getType())
                .isEqualTo(ColorSpace.TYPE_GRAY);

        Generated generated = generated(source);

        assertThat(generated.contentType()).isEqualTo("image/png");
        BufferedImage thumbnail = decode(generated);
        int center = thumbnail.getRGB(thumbnail.getWidth() / 2, thumbnail.getHeight() / 2);
        assertThat(center >>> 24).isEqualTo(255);
        assertThat((center >> 16) & 0xFF).isCloseTo(128, within(2));
        assertThat((center >> 8) & 0xFF).isCloseTo(128, within(2));
        assertThat(center & 0xFF).isCloseTo(128, within(2));
        assertThat(thumbnail.getRGB(0, 0) >>> 24).isZero();
    }

    @Test
    @DisplayName("알파가 없는 큰 PNG 와 JPEG 는 JPEG 썸네일이 된다(세로가 긴 원본은 세로가 384)")
    void opaqueSourcesBecomeJpegThumbnail() throws IOException {
        Generated fromPng = generated(ImageFixture.png(1000, 500, false));
        Generated fromJpeg = generated(ImageFixture.jpeg(500, 1000));

        assertThat(fromPng.contentType()).isEqualTo("image/jpeg");
        assertThat(fromPng.bytes()).startsWith((byte) 0xFF, (byte) 0xD8, (byte) 0xFF);
        assertThat(decode(fromPng).getWidth()).isEqualTo(384);
        assertThat(decode(fromPng).getHeight()).isEqualTo(192);
        assertThat(fromJpeg.contentType()).isEqualTo("image/jpeg");
        assertThat(decode(fromJpeg).getWidth()).isEqualTo(192);
        assertThat(decode(fromJpeg).getHeight()).isEqualTo(384);
    }

    @Test
    @DisplayName("원본 긴 변이 384 이하이면(정확히 384 포함) 새 객체 없이 원본을 쓴다")
    void smallOriginalIsUsedAsIs() {
        assertThat(LogoThumbnailGenerator.generate(ImageFixture.png(300, 200, true))).isInstanceOf(UseOriginal.class);
        assertThat(LogoThumbnailGenerator.generate(ImageFixture.png(384, 200, false))).isInstanceOf(UseOriginal.class);
        assertThat(LogoThumbnailGenerator.generate(ImageFixture.jpeg(100, 384))).isInstanceOf(UseOriginal.class);
    }

    @Test
    @DisplayName("원본 긴 변이 385 이면 384 로 줄인다(상한 경계) — 짧은 변은 비율대로 199")
    void justOverLimitIsScaled() throws IOException {
        Generated generated = generated(ImageFixture.png(385, 200, false));

        assertThat(decode(generated).getWidth()).isEqualTo(384);
        assertThat(decode(generated).getHeight()).isEqualTo(199);
    }

    @Test
    @DisplayName("극단적으로 납작한 원본(10000×10)도 짧은 변이 0 이 되지 않고 384×1 로 만든다")
    void extremeAspectRatioKeepsAtLeastOnePixel() throws IOException {
        Generated generated = generated(ImageFixture.png(10000, 10, false));

        assertThat(decode(generated).getWidth()).isEqualTo(384);
        assertThat(decode(generated).getHeight()).isEqualTo(1);
    }

    @Test
    @DisplayName("2,500만 픽셀을 넘는 치수는 디코딩하지 않고 건너뛴다")
    void tooManyPixelsIsSkippedBeforeDecoding() {
        // 헤더만 있는 PNG — 디코딩을 시도했다면 UNREADABLE 이었을 것이다. 치수 선검사가 먼저 끊어야 TOO_MANY_PIXELS 다.
        assertThat(skipReason(ImageFixture.pngHeaderOnly(6000, 5000))).isEqualTo(SkipReason.TOO_MANY_PIXELS);
    }

    @Test
    @DisplayName("정확히 2,500만 픽셀은 상한 안이라 디코딩으로 넘어간다")
    void exactlyAtPixelLimitProceedsToDecoding() {
        // 헤더만 있어 디코딩은 실패한다 — 치수 선검사를 통과했다는 신호가 UNREADABLE 이다.
        assertThat(skipReason(ImageFixture.pngHeaderOnly(5000, 5000))).isEqualTo(SkipReason.UNREADABLE);
    }

    @Test
    @DisplayName("픽셀 수가 상한 안이어도 긴 변이 16,384px 를 넘으면(가로·세로 모두) 디코딩하지 않고 건너뛴다")
    void tooLongSideIsSkippedBeforeDecoding() {
        // 헤더만 있는 PNG — 디코딩을 시도했다면 UNREADABLE 이었을 것이다. 24,000,000×1 은 픽셀 상한(2,500만) 안이라 긴 변 검사가 끊어야 한다.
        assertThat(skipReason(ImageFixture.pngHeaderOnly(24_000_000, 1))).isEqualTo(SkipReason.TOO_MANY_PIXELS);
        assertThat(skipReason(ImageFixture.pngHeaderOnly(1, 16_385))).isEqualTo(SkipReason.TOO_MANY_PIXELS);
    }

    @Test
    @DisplayName("긴 변이 정확히 16,384px 이면 상한 안이라 디코딩으로 넘어간다")
    void longSideExactlyAtLimitProceedsToDecoding() {
        // 헤더만 있어 디코딩은 실패한다 — 치수 선검사를 통과했다는 신호가 UNREADABLE 이다.
        assertThat(skipReason(ImageFixture.pngHeaderOnly(16_384, 1))).isEqualTo(SkipReason.UNREADABLE);
        assertThat(skipReason(ImageFixture.pngHeaderOnly(1, 16_384))).isEqualTo(SkipReason.UNREADABLE);
    }

    @Test
    @DisplayName("프로그레시브 JPEG 은 SOF2 로 감지되고, 800만 픽셀을 넘으면 디코딩하지 않고 건너뛴다(베이스라인 상한 2,500만과 별개)")
    void largeProgressiveJpegIsSkipped() {
        assertThat(LogoThumbnailGenerator.scanJpegHeader(ImageFixture.progressiveJpeg(800, 600)).progressive()).isTrue();
        assertThat(LogoThumbnailGenerator.scanJpegHeader(ImageFixture.jpeg(800, 600)).progressive()).isFalse();
        assertThat(LogoThumbnailGenerator.generate(ImageFixture.progressiveJpeg(800, 600))).isInstanceOf(Generated.class);

        // 4000×2100 = 840만 픽셀 — 프로그레시브 상한(800만)은 넘고 베이스라인 상한(2,500만)은 안이다.
        assertThat(skipReason(ImageFixture.progressiveJpeg(4000, 2100))).isEqualTo(SkipReason.TOO_MANY_PIXELS);
    }

    @Test
    @DisplayName("ImageIO 가 읽지 못하는 형식(WebP·텍스트)은 건너뛴다")
    void unsupportedFormatIsSkipped() {
        assertThat(skipReason(ImageFixture.webpHeaderOnly())).isEqualTo(SkipReason.UNSUPPORTED_FORMAT);
        assertThat(skipReason("not an image".getBytes(StandardCharsets.UTF_8))).isEqualTo(SkipReason.UNSUPPORTED_FORMAT);
    }

    @Test
    @DisplayName("치수는 읽히지만 픽셀 데이터가 없는 파일은 건너뛴다")
    void undecodableImageIsSkipped() {
        assertThat(skipReason(ImageFixture.pngHeaderOnly(800, 600))).isEqualTo(SkipReason.UNREADABLE);
    }

    @ParameterizedTest(name = "littleEndian={0}")
    @ValueSource(booleans = {true, false})
    @DisplayName("EXIF 방향이 정방향이 아닌 JPEG 는 바이트 순서(II·MM)와 무관하게 건너뛴다")
    void rotatedExifJpegIsSkipped(boolean littleEndian) {
        byte[] rotated = ImageFixture.jpegWithExifOrientation(800, 600, 6, littleEndian);

        assertThat(LogoThumbnailGenerator.readJpegExifOrientation(rotated)).isEqualTo(6);
        assertThat(skipReason(rotated)).isEqualTo(SkipReason.EXIF_ORIENTATION);
    }

    @Test
    @DisplayName("EXIF 가 있어도 방향이 정방향(1)이면 썸네일을 만들고, EXIF 가 없는 JPEG 는 정방향으로 본다")
    void uprightExifJpegIsGenerated() {
        assertThat(LogoThumbnailGenerator.readJpegExifOrientation(ImageFixture.jpeg(800, 600))).isEqualTo(1);
        assertThat(LogoThumbnailGenerator.generate(ImageFixture.jpegWithExifOrientation(800, 600, 1, true)))
                .isInstanceOf(Generated.class);
    }

    @Test
    @DisplayName("Exif 의 IFD 위치가 데이터 범위를 크게 벗어나면 정방향으로 보고 썸네일을 만든다(오버플로 없이 거른다)")
    void outOfRangeExifIfdOffsetIsTreatedAsUpright() {
        byte[] bogusOffset = ImageFixture.jpegWithExifIfdOffset(800, 600, Integer.MAX_VALUE - 1);

        assertThat(LogoThumbnailGenerator.readJpegExifOrientation(bogusOffset)).isEqualTo(1);
        assertThat(LogoThumbnailGenerator.generate(bogusOffset)).isInstanceOf(Generated.class);
    }

    @Test
    @DisplayName("서브샘플링 간격은 목표의 2배가 남도록 정한다 — 1150px 는 그대로, 1536px 는 2, 5000px 는 6")
    void subsamplingKeepsTwiceTheTarget() {
        assertThat(LogoThumbnailGenerator.subsamplingFor(1150)).isEqualTo(1);
        assertThat(LogoThumbnailGenerator.subsamplingFor(1536)).isEqualTo(2);
        assertThat(LogoThumbnailGenerator.subsamplingFor(5000)).isEqualTo(6);
    }
}
