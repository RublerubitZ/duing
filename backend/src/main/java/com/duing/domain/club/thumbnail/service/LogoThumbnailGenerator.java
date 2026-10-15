package com.duing.domain.club.thumbnail.service;

import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.Generated;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.SkipReason;
import com.duing.domain.club.thumbnail.service.LogoThumbnailResult.Skipped;
import com.duing.global.file.FileUploadPolicy;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Arrays;
import java.util.Iterator;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageReadParam;
import javax.imageio.ImageReader;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageInputStream;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/**
 * 동아리 로고 썸네일 생성기(스펙 §4.2) — JDK ImageIO 만 쓴다. 긴 변 {@value #MAX_LONG_SIDE}px·비율 유지, 알파가 있으면 PNG·없으면
 * JPEG(품질 {@value #JPEG_QUALITY}). 디코딩 전에 치수를 읽어 {@value #MAX_SOURCE_PIXELS} 픽셀 초과(프로그레시브 JPEG 은
 * {@value #MAX_PROGRESSIVE_JPEG_PIXELS})는 건너뛰고, 그 이하도 목표 크기에 맞춘 서브샘플링으로 읽어 래스터 메모리를 묶는다(운영 JVM
 * 기본 힙, #1465 전례). 축소는 절반씩 줄이다 마지막에 바이큐빅으로 맞춘다. 입출력은 모두 메모리 스트림이라 임시 파일을 쓰지 않는다.
 * 상태가 없어 어느 스레드에서 불러도 되고, 어떤 입력에도 예외를 던지지 않는다.
 */
public final class LogoThumbnailGenerator {

    public static final int MAX_LONG_SIDE = 384;
    public static final long MAX_SOURCE_PIXELS = 25_000_000L;
    /**
     * 프로그레시브 JPEG 의 픽셀 상한. libjpeg 는 프로그레시브 디코딩에 원본 전체 크기의 계수 버퍼(픽셀당 최대 약 6B — 4:4:4 3성분 × 2B)를
     * 네이티브 메모리로 잡아 서브샘플링이 줄여 주지 않고, 힙 밖이라 ExitOnOutOfMemoryError 도 막지 못한다. 운영 컨테이너 1400m 에서 힙
     * 75%(≈1050m)를 빼면 메타스페이스·스레드·소켓 버퍼와 나눠 쓰는 약 350m 가 남는다 — 그중 약 50MB 를 상한으로 두면 8,000,000 픽셀
     * (×6B = 48MB)이다. 운영 로고(긴 변 800~1150px, 약 100만 픽셀)는 전부 상한 안이다.
     */
    public static final long MAX_PROGRESSIVE_JPEG_PIXELS = 8_000_000L;
    static final float JPEG_QUALITY = 0.85f;
    static final int UPRIGHT_ORIENTATION = 1;

    /** JPEG 헤더에서 읽은 것 — Exif Orientation(없으면 1)과 프로그레시브 여부. */
    record JpegHeader(int orientation, boolean progressive) {
    }

    private static final JpegHeader PLAIN_JPEG_HEADER = new JpegHeader(UPRIGHT_ORIENTATION, false);

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
                long pixelLimit = jpegHeader.progressive() ? MAX_PROGRESSIVE_JPEG_PIXELS : MAX_SOURCE_PIXELS;
                if ((long) width * height > pixelLimit) {
                    return new Skipped(SkipReason.TOO_MANY_PIXELS);
                }
                int longSide = Math.max(width, height);
                if (longSide <= MAX_LONG_SIDE) {
                    return LogoThumbnailResult.USE_ORIGINAL;
                }
                if (jpegHeader.orientation() != UPRIGHT_ORIENTATION) {
                    return new Skipped(SkipReason.EXIF_ORIENTATION);
                }
                ImageReadParam readParam = reader.getDefaultReadParam();
                int subsampling = subsamplingFor(longSide);
                readParam.setSourceSubsampling(subsampling, subsampling, 0, 0);
                BufferedImage decoded = reader.read(0, readParam);
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

    /** {@link #scanJpegHeader} 의 방향만 — 테스트·가독성용. */
    static int readJpegExifOrientation(byte[] jpeg) {
        return scanJpegHeader(jpeg).orientation();
    }

    /**
     * 스캔 데이터(SOS) 앞의 세그먼트를 한 번 훑어 두 가지를 읽는다 — SOF2·SOF6·SOF10·SOF14 가 있으면 프로그레시브, APP1(Exif) 의 TIFF IFD0
     * 에서 Orientation(0x0112). 바이트 순서 II(리틀)·MM(빅)을 모두 다루고, APP1 이 없거나 구조가 깨졌으면 정방향(1)으로 본다 — 대부분의
     * 로고는 EXIF 가 없다. 세그먼트 길이가 남은 바이트를 넘으면 그 자리에서 멈춘다(매 회 1바이트 이상 전진해 무한 루프가 없다).
     */
    static JpegHeader scanJpegHeader(byte[] jpeg) {
        int orientation = UPRIGHT_ORIENTATION;
        boolean progressive = false;
        ByteBuffer buffer = ByteBuffer.wrap(jpeg);
        if (buffer.remaining() < 4 || (buffer.getShort() & 0xFFFF) != 0xFFD8) {
            return new JpegHeader(orientation, progressive);
        }
        while (buffer.remaining() >= 4) {
            int marker = buffer.getShort() & 0xFFFF;
            if (marker == 0xFFFF) {
                buffer.position(buffer.position() - 1); // 마커 앞 채움 바이트(0xFF) 건너뜀
                continue;
            }
            if ((marker & 0xFF00) != 0xFF00 || marker == 0xFFDA || marker == 0xFFD9) {
                break; // 손상 또는 스캔 데이터 시작·끝 — 헤더 세그먼트는 여기까지다
            }
            int segmentLength = buffer.getShort() & 0xFFFF;
            if (segmentLength < 2 || segmentLength - 2 > buffer.remaining()) {
                break;
            }
            int segmentStart = buffer.position();
            if (marker == 0xFFC2 || marker == 0xFFC6 || marker == 0xFFCA || marker == 0xFFCE) {
                progressive = true; // SOF2·SOF6·SOF10·SOF14 — 프로그레시브(허프만·산술, 비차분·차분)
            } else if (marker == 0xFFE1 && segmentLength >= 2 + 6 + 8
                    && buffer.getInt(segmentStart) == 0x45786966 && buffer.getShort(segmentStart + 4) == 0) { // "Exif\0\0"
                orientation = orientationFromTiff(buffer.slice(segmentStart + 6, segmentLength - 2 - 6));
            }
            buffer.position(segmentStart + segmentLength - 2);
        }
        return new JpegHeader(orientation, progressive);
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
