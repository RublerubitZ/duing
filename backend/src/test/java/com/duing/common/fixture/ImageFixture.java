package com.duing.common.fixture;

import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.awt.image.DataBuffer;
import java.awt.image.WritableRaster;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.zip.CRC32;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;

/** 테스트용 이미지 바이트 — 로고 썸네일 생성기·서비스·백필 테스트가 같은 원본을 쓴다. */
public final class ImageFixture {

    private ImageFixture() {
    }

    /** 대각선 그라데이션 PNG. alpha=true 면 가로 방향으로 투명도가 변해 알파 채널이 실제로 쓰인다. */
    public static byte[] png(int width, int height, boolean alpha) {
        return write(gradient(width, height, alpha), "png");
    }

    /** 대각선 그라데이션 베이스라인 JPEG(알파 없음, EXIF 없음). */
    public static byte[] jpeg(int width, int height) {
        return write(gradient(width, height, false), "jpeg");
    }

    /** 프로그레시브(SOF2) JPEG — ImageIO 의 progressive 모드로 쓴다. */
    public static byte[] progressiveJpeg(int width, int height) {
        ImageWriter writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        ImageWriteParam writeParam = writer.getDefaultWriteParam();
        writeParam.setProgressiveMode(ImageWriteParam.MODE_DEFAULT);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try (ImageOutputStream imageOutput = new MemoryCacheImageOutputStream(output)) {
            writer.setOutput(imageOutput);
            writer.write(null, new IIOImage(gradient(width, height, false), null, null), writeParam);
        } catch (IOException writeFailure) {
            throw new UncheckedIOException(writeFailure);
        } finally {
            writer.dispose();
        }
        return output.toByteArray();
    }

    /**
     * SOI 바로 뒤에 Orientation 항목 하나만 담은 APP1(Exif) 세그먼트를 끼운 JPEG.
     * littleEndian=true 면 TIFF 헤더 "II", 아니면 "MM" — 생성기의 바이트 순서 처리를 둘 다 확인한다.
     */
    public static byte[] jpegWithExifOrientation(int width, int height, int orientation, boolean littleEndian) {
        return withExifApp1(jpeg(width, height), exifTiff(littleEndian, 8, orientation));
    }

    /** IFD0 위치만 바꾼 Exif(항목은 정방향 1) — 범위 밖 오프셋을 파서가 정방향으로 다루는지 보는 용도. */
    public static byte[] jpegWithExifIfdOffset(int width, int height, int ifdOffset) {
        return withExifApp1(jpeg(width, height), exifTiff(true, ifdOffset, 1));
    }

    /**
     * 회색+알파 PNG(색 타입 4) — 가운데(가로·세로 1/4~3/4)는 불투명한 회색 {@code gray}(0~255), 나머지는 완전 투명.
     * sixteenBit=true 면 16비트 샘플(값을 ×257 로 늘린다).
     */
    public static byte[] grayAlphaPng(int width, int height, int gray, boolean sixteenBit) {
        int scale = sixteenBit ? 257 : 1;
        BufferedImage image = ImageTypeSpecifier.createInterleaved(ColorSpace.getInstance(ColorSpace.CS_GRAY),
                new int[]{0, 1}, sixteenBit ? DataBuffer.TYPE_USHORT : DataBuffer.TYPE_BYTE, true, false)
                .createBufferedImage(width, height);
        WritableRaster raster = image.getRaster();
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                boolean opaque = x >= width / 4 && x < width * 3 / 4 && y >= height / 4 && y < height * 3 / 4;
                raster.setSample(x, y, 0, opaque ? gray * scale : 0);
                raster.setSample(x, y, 1, opaque ? 255 * scale : 0);
            }
        }
        return write(image, "png");
    }

    /** 시그니처와 IHDR 까지만 있는 PNG — 치수는 읽히지만 픽셀 데이터가 없어 디코딩은 실패한다. */
    public static byte[] pngHeaderOnly(int width, int height) {
        ByteBuffer chunk = ByteBuffer.allocate(4 + 13);
        chunk.put("IHDR".getBytes(StandardCharsets.US_ASCII));
        chunk.putInt(width).putInt(height);
        chunk.put((byte) 8).put((byte) 6).put((byte) 0).put((byte) 0).put((byte) 0); // 8비트 RGBA, 압축·필터·인터레이스 0
        CRC32 crc = new CRC32();
        crc.update(chunk.array());
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        output.writeBytes(new byte[]{(byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A});
        output.writeBytes(ByteBuffer.allocate(4).putInt(13).array());
        output.writeBytes(chunk.array());
        output.writeBytes(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
        return output.toByteArray();
    }

    /** RIFF/WEBP 컨테이너 헤더만 있는 바이트 — ImageIO 가 읽지 못하는 형식의 대표. */
    public static byte[] webpHeaderOnly() {
        byte[] header = new byte[20];
        System.arraycopy("RIFF".getBytes(StandardCharsets.US_ASCII), 0, header, 0, 4);
        System.arraycopy("WEBPVP8 ".getBytes(StandardCharsets.US_ASCII), 0, header, 8, 8);
        return header;
    }

    // TIFF 헤더(8) + IFD0(항목 수 2 + 항목 12 + 다음 IFD 4) = 26바이트. ifdOffset 은 IFD0 의 위치 필드 값(정상은 8).
    private static byte[] exifTiff(boolean littleEndian, int ifdOffset, int orientation) {
        ByteBuffer tiff = ByteBuffer.allocate(26).order(littleEndian ? ByteOrder.LITTLE_ENDIAN : ByteOrder.BIG_ENDIAN);
        tiff.putShort(littleEndian ? (short) 0x4949 : (short) 0x4D4D);
        tiff.putShort((short) 0x002A);
        tiff.putInt(ifdOffset);
        tiff.putShort((short) 1);          // 항목 수
        tiff.putShort((short) 0x0112);     // Orientation
        tiff.putShort((short) 3);          // SHORT
        tiff.putInt(1);                    // 개수
        tiff.putShort((short) orientation);
        tiff.putShort((short) 0);          // 값 필드 나머지 2바이트
        tiff.putInt(0);                    // 다음 IFD 없음
        return tiff.array();
    }

    private static byte[] withExifApp1(byte[] jpeg, byte[] tiff) {
        byte[] exifHeader = {'E', 'x', 'i', 'f', 0, 0};
        int segmentLength = 2 + exifHeader.length + tiff.length;
        ByteBuffer result = ByteBuffer.allocate(jpeg.length + 2 + segmentLength);
        result.put(jpeg, 0, 2);            // SOI
        result.putShort((short) 0xFFE1);
        result.putShort((short) segmentLength);
        result.put(exifHeader);
        result.put(tiff);
        result.put(jpeg, 2, jpeg.length - 2);
        return result.array();
    }

    private static BufferedImage gradient(int width, int height, boolean alpha) {
        BufferedImage image = new BufferedImage(width, height,
                alpha ? BufferedImage.TYPE_INT_ARGB : BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int red = (x * 255) / Math.max(1, width - 1);
                int blue = (y * 255) / Math.max(1, height - 1);
                int alphaValue = alpha ? red : 255;
                image.setRGB(x, y, (alphaValue << 24) | (red << 16) | (96 << 8) | blue);
            }
        }
        return image;
    }

    private static byte[] write(BufferedImage image, String format) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try {
            ImageIO.write(image, format, output);
        } catch (IOException writeFailure) {
            throw new UncheckedIOException(writeFailure);
        }
        return output.toByteArray();
    }
}
