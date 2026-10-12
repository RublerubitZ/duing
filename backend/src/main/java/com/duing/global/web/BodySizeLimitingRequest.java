package com.duing.global.web;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;

/**
 * 길이를 모르는(chunked) 요청 본문을 읽는 만큼 세어 상한을 넘는 순간 {@link RequestBodyTooLargeException} 을 던진다.
 * 길이를 아는 요청은 컨테이너가 그 길이만큼만 읽으므로 감싸지 않는다({@link RequestBodySizeLimitFilter}).
 */
final class BodySizeLimitingRequest extends HttpServletRequestWrapper {

    private final long maxBodyBytes;
    private ServletInputStream limitedInputStream;
    private BufferedReader limitedReader;

    BodySizeLimitingRequest(HttpServletRequest request, long maxBodyBytes) {
        super(request);
        this.maxBodyBytes = maxBodyBytes;
    }

    @Override
    public ServletInputStream getInputStream() throws IOException {
        if (limitedInputStream == null) {
            limitedInputStream = new LimitedInputStream(super.getInputStream(), maxBodyBytes);
        }
        return limitedInputStream;
    }

    // 그대로 위임하면 컨테이너 스트림을 직접 읽어 계수를 우회한다 — 같은 계수 스트림 위에 만든다.
    // 인코딩이 없으면 서블릿 기본값(ISO-8859-1)을 따른다.
    @Override
    public BufferedReader getReader() throws IOException {
        if (limitedReader == null) {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.ISO_8859_1 : Charset.forName(encoding);
            limitedReader = new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
        return limitedReader;
    }

    private static final class LimitedInputStream extends ServletInputStream {

        private final ServletInputStream delegate;
        private final long maxBodyBytes;
        private long readBytes;

        private LimitedInputStream(ServletInputStream delegate, long maxBodyBytes) {
            this.delegate = delegate;
            this.maxBodyBytes = maxBodyBytes;
        }

        @Override
        public int read() throws IOException {
            int nextByte = delegate.read();
            if (nextByte != -1) {
                countRead(1);
            }
            return nextByte;
        }

        // InputStream 의 read(byte[])·readAllBytes·readNBytes·skip 은 모두 이 메서드를 거친다.
        @Override
        public int read(byte[] buffer, int offset, int length) throws IOException {
            int readCount = delegate.read(buffer, offset, length);
            if (readCount > 0) {
                countRead(readCount);
            }
            return readCount;
        }

        private void countRead(int newlyReadBytes) throws RequestBodyTooLargeException {
            readBytes += newlyReadBytes;
            if (readBytes > maxBodyBytes) {
                throw new RequestBodyTooLargeException();
            }
        }

        @Override
        public boolean isFinished() {
            return delegate.isFinished();
        }

        @Override
        public boolean isReady() {
            return delegate.isReady();
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            delegate.setReadListener(readListener);
        }
    }
}
