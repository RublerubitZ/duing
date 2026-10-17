package com.duing.domain.club.thumbnail.service;

import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.Generated;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.SkipReason;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.Skipped;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.UseOriginal;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.UseOriginalReason;
import com.duing.global.file.FileUploadPolicy;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.color.ColorSpace;
import java.awt.color.ICC_ColorSpace;
import java.awt.color.ICC_Profile;
import java.awt.image.BufferedImage;
import java.awt.image.Raster;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.Iterator;
import java.util.zip.InflaterInputStream;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * 동아리 로고 썸네일 생성기(스펙 §4.2) — JDK ImageIO 만 쓴다. 긴 변 {@value #MAX_LONG_SIDE}px·비율 유지, 알파가 있으면 PNG·없으면
 * JPEG(품질 {@value #JPEG_QUALITY}). 디코딩 전에 치수를 읽어 {@value #MAX_SOURCE_PIXELS} 픽셀 초과(프로그레시브·다중 스캔 JPEG 은
 * {@value #MAX_PROGRESSIVE_JPEG_PIXELS})나 긴 변 {@value #MAX_SOURCE_LONG_SIDE}px 초과는 건너뛰고, 그 이하도 목표 크기에 맞춘
 * 서브샘플링으로 읽어 래스터 메모리를 묶는다(운영 JVM 기본 힙, #1465 전례). 축소는 절반씩 줄이다 마지막에 바이큐빅으로 맞춘다. 색 프로파일은
 * 옮기지 않으므로 sRGB 가 아닌 RGB ICC 프로파일이 붙은 원본은 줄이지 않고 원본을 쓴다(디코딩 전 헤더로 정한다). 입출력은
 * 모두 메모리 스트림이라 임시 파일을 쓰지 않는다.
 * 상태가 없어 어느 스레드에서 불러도 되고, 어떤 입력에도 예외를 던지지 않는다.
 */
public final class LogoThumbnailGenerator {

    public static final int MAX_LONG_SIDE = 384;
    public static final long MAX_SOURCE_PIXELS = 25_000_000L;
    /** 원본 긴 변 상한 — PNG 리더는 서브샘플링과 무관하게 원본 폭만큼 행 버퍼를 잡아, 픽셀 수 상한과 따로 묶는다. */
    public static final int MAX_SOURCE_LONG_SIDE = 16_384;
    /**
     * 프로그레시브·다중 스캔(첫 스캔이 프레임의 일부 성분만 담는 순차) JPEG 의 픽셀 상한. libjpeg 는 이런 JPEG 를 원본 전체 크기의 계수
     * 버퍼(픽셀당 최대 약 6B — 4:4:4 3성분 × 2B)에 모아 디코딩하고, 이 버퍼는 힙 밖에 잡혀 서브샘플링이 줄여 주지 않는다. 8,000,000 픽셀
     * (×6B = 48MB)로 묶는다. 운영 로고(긴 변 800~1150px, 약 100만 픽셀)는 전부 상한 안이다.
     * 헤더가 첫 스캔까지 길이 있는 마커로 이어지지 않는 JPEG 도 스캔 구성을 알 수 없어 이 상한을 쓴다.
     */
    public static final long MAX_PROGRESSIVE_JPEG_PIXELS = 8_000_000L;
    static final float JPEG_QUALITY = 0.85f;
    static final int UPRIGHT_ORIENTATION = 1;
    /** sRGB 판정에 쓰는 색 — 원색 셋(1.0)이 원색·백색점을, 중간 회색(0.5)이 곡선을 드러낸다. */
    private static final float[][] SRGB_PROBE_COLORS = {{1f, 0f, 0f}, {0f, 1f, 0f}, {0f, 0f, 1f}, {0.5f, 0.5f, 0.5f}};
    /**
     * sRGB 와 같다고 보는 XYZ(D50) 차이 상한. JDK 21 실측 — sRGB 계열(JDK 내장, macOS sRGB IEC61966-2.1)은 0.0003 이하이고, 가장 가까운
     * sRGB 아닌 프로파일(원색은 같고 곡선만 다른 BT.709)이 0.045, Display P3 가 0.093 이다.
     */
    private static final float SRGB_XYZ_TOLERANCE = 0.01f;
    /** iCCP 를 풀어 읽는 상한 — 행렬·곡선형 프로파일은 수 KB 다. 넘으면 읽지 못한 것으로 본다(압축 폭탄). */
    private static final int MAX_ICC_PROFILE_BYTES = 1 << 20;
    private static final int PNG_SIGNATURE_LENGTH = 8;
    private static final int PNG_ICCP_CHUNK = 0x69434350;
    private static final int PNG_IDAT_CHUNK = 0x49444154;

    /**
     * JPEG 헤더에서 읽은 것 — Exif Orientation(없으면 1)·프로그레시브 여부·다중 스캔 여부(첫 스캔이 프레임의 일부 성분만 담거나,
     * 헤더가 첫 스캔까지 길이 있는 마커로 이어지지 않아 알 수 없다).
     */
    record JpegHeader(int orientation, boolean progressive, boolean multiScan) {
    }

    private static final JpegHeader PLAIN_JPEG_HEADER = new JpegHeader(UPRIGHT_ORIENTATION, false, false);

    private LogoThumbnailGenerator() {
    }

    public static LogoThumbnailResult generate(byte[] source) {
        try (ImageInputStream input = new MemoryCacheImageInputStream(new ByteArrayInputStream(source))) {
            Iterator<ImageReader> readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) {
                return new Skipped(SkipReason.UNSUPPORTED_FORMAT);
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(input, true, true);
                int width = reader.getWidth(0);
                int height = reader.getHeight(0);
                boolean jpeg = isJpeg(source);
                JpegHeader jpegHeader = jpeg ? scanJpegHeader(source) : PLAIN_JPEG_HEADER;
                long pixelLimit = jpegHeader.progressive() || jpegHeader.multiScan()
                        ? MAX_PROGRESSIVE_JPEG_PIXELS : MAX_SOURCE_PIXELS;
                int longSide = Math.max(width, height);
                if ((long) width * height > pixelLimit || longSide > MAX_SOURCE_LONG_SIDE) {
                    return new Skipped(SkipReason.TOO_MANY_PIXELS);
                }
                if (longSide <= MAX_LONG_SIDE) {
                    return LogoThumbnailResult.USE_ORIGINAL;
                }
                if (jpegHeader.orientation() != UPRIGHT_ORIENTATION) {
                    return new Skipped(SkipReason.EXIF_ORIENTATION);
                }
                // 치수 상한 뒤·디코딩 전 — 헤더만 본다(JPEG 은 이미 읽은 헤더, PNG 는 첫 IDAT 앞 청크). 큰 원본도 래스터를 잡지 않는다.
                if (hasNonSrgbRgbProfile(source, jpeg, reader)) {
                    return new UseOriginal(UseOriginalReason.NON_SRGB_PROFILE);
                }
                ImageReadParam readParam = reader.getDefaultReadParam();
                int subsampling = subsamplingFor(longSide);
                readParam.setSourceSubsampling(subsampling, subsampling, 0, 0);
                BufferedImage decoded = reader.read(0, readParam);
                if (decoded.getColorModel().getColorSpace().getType() == ColorSpace.TYPE_GRAY
                        && decoded.getColorModel().hasAlpha()) {
                    decoded = copyGrayAlphaToArgb(decoded);
                }
                boolean alpha = decoded.getColorModel().hasAlpha();
                double scale = MAX_LONG_SIDE / (double) longSide;
                BufferedImage scaled = scaleDown(decoded,
                        Math.max(1, (int) Math.round(width * scale)),
                        Math.max(1, (int) Math.round(height * scale)), alpha);
                return alpha
                        ? new Generated(encodePng(scaled), "image/png")
                        : new Generated(encodeJpeg(scaled), "image/jpeg");
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException decodeFailure) {
            // CMYK JPEG 는 IIOException("Unsupported Image Type"), 손상 파일은 EOF·zlib 오류 등 — 전부 건너뜀.
            return new Skipped(SkipReason.UNREADABLE);
        }
    }

    /** 목표의 2배 이상이 남도록 읽는 간격 — 그 뒤 단계적 축소가 화질을 맡는다. 1150px 는 1(그대로), 5000px 는 6(≈833px). */
    static int subsamplingFor(int longSide) {
        return Math.max(1, longSide / (MAX_LONG_SIDE * 2));
    }

    private static boolean isJpeg(byte[] source) {
        return "image/jpeg".equals(FileUploadPolicy.detectImageContentType(Arrays.copyOf(source, 12)));
    }

    private static boolean isPng(byte[] source) {
        return "image/png".equals(FileUploadPolicy.detectImageContentType(Arrays.copyOf(source, 12)));
    }

    /**
     * 원본에 sRGB 가 아닌 RGB ICC 프로파일이 붙었는가. JDK 21 실측으로 디코딩 결과의 색 공간은 늘 sRGB 다 — JPEG 리더는 내장 프로파일에서
     * sRGB 로 바꿔 내주고(넓은 색역이 잘린다), PNG 리더는 iCCP 를 디코딩에 쓰지 않는다. 그래서 헤더에서 읽는다. 회색·CMYK 프로파일은
     * 대상이 아니고(회색은 지금의 회색 분기로 간다), 없거나 읽지 못하면 sRGB 로 본다(fail-open — 지금처럼 만든다).
     */
    private static boolean hasNonSrgbRgbProfile(byte[] source, boolean jpeg, ImageReader reader) {
        try {
            ICC_Profile profile = jpeg ? jpegEmbeddedRgbProfile(reader) : pngIccProfile(source);
            return profile != null && profile.getColorSpaceType() == ColorSpace.TYPE_RGB
                    && !matchesSrgb(new ICC_ColorSpace(profile));
        } catch (IOException | RuntimeException unreadableProfile) {
            return false;
        }
    }

    /**
     * JPEG 리더가 헤더의 APP2 ICC_PROFILE 로 만든 RGB 색 공간 — 형식 목록에 기본 sRGB 와 따로 들어온다(JFIF 유무와 무관하고, 깨진
     * 프로파일은 리더가 버린다). 메타데이터는 쓰지 않는다 — JFIF 가 없으면 프로파일이 원시 바이트로만 담기고, 마커 순서가 어긋나면 예외다.
     * shortcut: YCbCr 가 아니라 RGB 로 부호화한 JPEG(Adobe 변환 0 등)은 리더가 프로파일을 목록에 싣지 않아 sRGB 로 본다, 그런 로고가 보이면
     * APP2 를 직접 읽는다.
     */
    private static ICC_Profile jpegEmbeddedRgbProfile(ImageReader reader) throws IOException {
        for (Iterator<ImageTypeSpecifier> types = reader.getImageTypes(0); types.hasNext(); ) {
            ColorSpace colorSpace = types.next().getColorModel().getColorSpace();
            if (colorSpace instanceof ICC_ColorSpace embedded && colorSpace.getType() == ColorSpace.TYPE_RGB
                    && !colorSpace.isCS_sRGB()) {
                return embedded.getProfile();
            }
        }
        return null;
    }

    /**
     * PNG 의 iCCP 프로파일 — 첫 IDAT 앞 청크만 훑는다(iCCP 는 그 앞에만 온다). JDK 리더의 메타데이터로 읽지 않는다 — iCCP 를 담으려면
     * ignoreMetadata=false 로 읽어야 하는데, 그러면 zTXt·iTXt 를 청크마다 256KB 까지 풀어 쌓아(청크 수 상한 없음) 힙이 찬다(JDK 21 실측:
     * 117KB 파일이 +100MB, 876KB 파일이 512MB 힙에서 OOM). PNG 가 아니거나 iCCP 가 없거나 구조가 깨졌으면 null.
     */
    private static ICC_Profile pngIccProfile(byte[] png) throws IOException {
        if (!isPng(png)) {
            return null;
        }
        ByteBuffer buffer = ByteBuffer.wrap(png);
        buffer.position(PNG_SIGNATURE_LENGTH);
        while (buffer.remaining() >= 8) {
            int length = buffer.getInt();
            int type = buffer.getInt();
            int dataStart = buffer.position();
            if (length < 0 || length > buffer.remaining() - 4 || type == PNG_IDAT_CHUNK) {
                return null; // 길이 이상(뒤 CRC 4바이트 포함)·이미지 데이터 시작
            }
            if (type == PNG_ICCP_CHUNK) {
                // 데이터는 프로파일 이름·0·압축 방식(0 = zlib)·압축한 프로파일이다.
                int dataEnd = dataStart + length;
                int nameEnd = dataStart;
                while (nameEnd < dataEnd && png[nameEnd] != 0) {
                    nameEnd++;
                }
                if (nameEnd == dataStart || nameEnd + 2 > dataEnd || png[nameEnd + 1] != 0) {
                    return null;
                }
                try (InputStream profileStream = new InflaterInputStream(
                        new ByteArrayInputStream(png, nameEnd + 2, dataEnd - nameEnd - 2))) {
                    byte[] profileBytes = profileStream.readNBytes(MAX_ICC_PROFILE_BYTES + 1);
                    return profileBytes.length > MAX_ICC_PROFILE_BYTES ? null : ICC_Profile.getInstance(profileBytes);
                }
            }
            buffer.position(dataStart + length + 4); // 데이터 + CRC
        }
        return null;
    }

    /**
     * 프로파일이 sRGB 와 같은 색을 내는가 — 원색 셋과 중간 회색을 XYZ(D50)로 옮겨 JDK 내장 sRGB 와 견준다(원색·백색점·곡선을 함께 본다).
     * 설명 태그는 쓰지 않는다 — 이름은 만든 곳마다 제각각이고, JDK 의 선형 프로파일 이름도 "linear sRGB" 다.
     */
    private static boolean matchesSrgb(ICC_ColorSpace profileSpace) {
        ColorSpace srgb = ColorSpace.getInstance(ColorSpace.CS_sRGB);
        for (float[] probe : SRGB_PROBE_COLORS) {
            float[] actual = profileSpace.toCIEXYZ(probe);
            float[] expected = srgb.toCIEXYZ(probe);
            for (int axis = 0; axis < 3; axis++) {
                if (Math.abs(actual[axis] - expected[axis]) > SRGB_XYZ_TOLERANCE) {
                    return false;
                }
            }
        }
        return true;
    }

    /** {@link #scanJpegHeader} 의 방향만 — 테스트·가독성용. */
    static int readJpegExifOrientation(byte[] jpeg) {
        return scanJpegHeader(jpeg).orientation();
    }

    /**
     * 스캔 데이터(SOS) 앞의 세그먼트를 한 번 훑어 세 가지를 읽는다 — SOF2·SOF6·SOF10·SOF14 가 있으면 프로그레시브, 첫 SOS 의 성분 수(Ns)가
     * SOF0·SOF1·SOF2 의 성분 수(Nf)보다 적으면 다중 스캔, APP1(Exif) 의 TIFF IFD0 에서 Orientation(0x0112). 바이트 순서 II(리틀)·MM(빅)을
     * 모두 다루고, APP1 이 없거나 구조가 깨졌으면 정방향(1)으로 본다 — 대부분의 로고는 EXIF 가 없다. 세그먼트 길이가 남은 바이트를 넘으면
     * 그 자리에서 멈춘다(매 회 1바이트 이상 전진해 무한 루프가 없다). 첫 SOS 에 닿기 전에 멈추면(길이 없는 마커·마커가 아닌 바이트·이미지 끝·
     * 길이 이상) 다중 스캔으로 본다 — 디코더는 그런 바이트를 건너뛰고 읽으므로 일반 상한은 첫 SOS 까지 길이 있는 마커로 이어질 때만 쓴다.
     */
    static JpegHeader scanJpegHeader(byte[] jpeg) {
        int orientation = UPRIGHT_ORIENTATION;
        boolean progressive = false;
        boolean multiScan = true; // 첫 SOS 의 Ns 를 읽었을 때만 거짓이 될 수 있다
        int frameComponents = 0;
        ByteBuffer buffer = ByteBuffer.wrap(jpeg);
        if (buffer.remaining() < 4 || (buffer.getShort() & 0xFFFF) != 0xFFD8) {
            return new JpegHeader(orientation, progressive, multiScan);
        }
        while (buffer.remaining() >= 4) {
            int marker = buffer.getShort() & 0xFFFF;
            if (marker == 0xFFFF) {
                buffer.position(buffer.position() - 1); // 마커 앞 채움 바이트(0xFF) 건너뜀
                continue;
            }
            if (marker == 0xFFDA) {
                // SOS 는 마커 뒤 Ls(2)·Ns(1) — 첫 스캔이 프레임의 성분을 다 담지 않으면 순차 JPEG 도 여러 스캔으로 나뉜다.
                multiScan = buffer.remaining() < 3 || (buffer.get(buffer.position() + 2) & 0xFF) < frameComponents;
            }
            if ((marker & 0xFF00) != 0xFF00 || marker == 0xFFDA || marker == 0xFFD9
                    || marker == 0xFF00 || marker == 0xFF01 || (marker >= 0xFFD0 && marker <= 0xFFD7)) {
                break; // 마커가 아닌 바이트(FF00 포함)·스캔 데이터 시작·이미지 끝·길이 없는 마커(TEM·RSTn) — 헤더 세그먼트는 여기까지다
            }
            int segmentLength = buffer.getShort() & 0xFFFF;
            if (segmentLength < 2 || segmentLength - 2 > buffer.remaining()) {
                break;
            }
            int segmentStart = buffer.position();
            if (marker >= 0xFFC0 && marker <= 0xFFC2 && segmentLength >= 2 + 6) {
                frameComponents = buffer.get(segmentStart + 5) & 0xFF; // SOF0·SOF1·SOF2 — 길이 뒤 P(1)·Y(2)·X(2) 다음 Nf(1)
            }
            if (marker == 0xFFC2 || marker == 0xFFC6 || marker == 0xFFCA || marker == 0xFFCE) {
                progressive = true; // SOF2·SOF6·SOF10·SOF14 — 프로그레시브(허프만·산술, 비차분·차분)
            } else if (marker == 0xFFE1 && segmentLength >= 2 + 6 + 8
                    && buffer.getInt(segmentStart) == 0x45786966 && buffer.getShort(segmentStart + 4) == 0) { // "Exif\0\0"
                orientation = orientationFromTiff(buffer.slice(segmentStart + 6, segmentLength - 2 - 6));
            }
            buffer.position(segmentStart + segmentLength - 2);
        }
        return new JpegHeader(orientation, progressive, multiScan);
    }

    private static int orientationFromTiff(ByteBuffer tiff) {
        short byteOrder = tiff.getShort(0);
        if (byteOrder == 0x4949) {
            tiff.order(ByteOrder.LITTLE_ENDIAN);
        } else if (byteOrder != 0x4D4D) {
            return UPRIGHT_ORIENTATION;
        }
        if ((tiff.getShort(2) & 0xFFFF) != 0x002A) {
            return UPRIGHT_ORIENTATION;
        }
        int ifdOffset = tiff.getInt(4);
        // 오프셋은 더하지 말고 뺀 값과 비교한다 — 큰 값은 덧셈에서 넘쳐 음수가 되어 범위 검사를 통과한다.
        if (ifdOffset < 8 || ifdOffset > tiff.limit() - 2) {
            return UPRIGHT_ORIENTATION;
        }
        int entryCount = tiff.getShort(ifdOffset) & 0xFFFF;
        for (int index = 0; index < entryCount; index++) {
            int entry = ifdOffset + 2 + index * 12; // ifdOffset ≤ limit, index < 65536 — 넘치지 않는다
            if (entry > tiff.limit() - 12) {
                return UPRIGHT_ORIENTATION;
            }
            if ((tiff.getShort(entry) & 0xFFFF) != 0x0112) {
                continue;
            }
            if ((tiff.getShort(entry + 2) & 0xFFFF) != 3) {
                return UPRIGHT_ORIENTATION; // SHORT 가 아니면 규격 밖 — 정방향으로 본다
            }
            return tiff.getShort(entry + 8) & 0xFFFF; // 개수 1 의 SHORT 는 값 필드 앞 2바이트(바이트 순서 적용)
        }
        return UPRIGHT_ORIENTATION;
    }

    /**
     * 회색+알파(PNG 색 타입 4·회색+tRNS)는 JDK 가 선형 회색 공간(CS_GRAY)으로 내줘, drawImage 의 색 변환이 감마를 씌워 밝아진다.
     * 샘플을 그대로 ARGB 로 옮겨 그 변환을 건너뛴다 — 브라우저는 PNG 회색 값을 sRGB 로 보이므로 R·G·B 에 같은 값을 넣는 것이 원본과 같다.
     */
    private static BufferedImage copyGrayAlphaToArgb(BufferedImage grayAlpha) {
        Raster samples = grayAlpha.getRaster();
        int shift = samples.getSampleModel().getSampleSize(0) - 8; // 리더가 내주는 샘플은 8·16비트뿐(1·2·4비트 회색+tRNS 도 8비트로 늘린다)
        BufferedImage argb = new BufferedImage(grayAlpha.getWidth(), grayAlpha.getHeight(), BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < grayAlpha.getHeight(); y++) {
            for (int x = 0; x < grayAlpha.getWidth(); x++) {
                int gray = samples.getSample(x, y, 0) >>> shift;
                int alpha = samples.getSample(x, y, 1) >>> shift;
                argb.setRGB(x, y, (alpha << 24) | (gray << 16) | (gray << 8) | gray);
            }
        }
        return argb;
    }

    /** 절반씩 줄이다(이중선형) 마지막 한 번을 바이큐빅으로 목표에 맞춘다 — 한 번에 1/2 넘게 줄이면 보간이 픽셀을 건너뛰어 계단이 생긴다. */
    private static BufferedImage scaleDown(BufferedImage source, int targetWidth, int targetHeight, boolean alpha) {
        int imageType = alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB;
        BufferedImage current = source;
        while (current.getWidth() / 2 >= targetWidth && current.getHeight() / 2 >= targetHeight) {
            current = draw(current, current.getWidth() / 2, current.getHeight() / 2, imageType,
                    RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        }
        return draw(current, targetWidth, targetHeight, imageType, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
    }

    private static BufferedImage draw(BufferedImage source, int width, int height, int imageType, Object interpolation) {
        BufferedImage target = new BufferedImage(width, height, imageType);
        Graphics2D graphics = target.createGraphics();
        try {
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, interpolation);
            graphics.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally {
            graphics.dispose();
        }
        return target;
    }

    private static byte[] encodePng(BufferedImage image) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        // ImageIO.write(…, OutputStream) 은 임시 파일 캐시를 쓴다 — JPEG 쪽과 같이 메모리 스트림에 쓴다.
        try (ImageOutputStream imageOutput = new MemoryCacheImageOutputStream(output)) {
            ImageIO.write(image, "png", imageOutput);
        }
        return output.toByteArray();
    }

    private static byte[] encodeJpeg(BufferedImage image) throws IOException {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam writeParam = writer.getDefaultWriteParam();
        writeParam.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
        writeParam.setCompressionQuality(JPEG_QUALITY);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ImageOutputStream imageOutput = new MemoryCacheImageOutputStream(output)) {
            writer.setOutput(imageOutput);
            writer.write(null, new IIOImage(image, null, null), writeParam);
        } finally {
            writer.dispose();
        }
        return output.toByteArray();
    }
}
