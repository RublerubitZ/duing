package com.duing.global.file.exception;

import com.duing.global.exception.ApplicationException;
import com.duing.global.file.FileUploadPolicy;
import org.springframework.http.HttpStatus;

public class FileException extends ApplicationException {

    protected FileException(String message, HttpStatus status) {
        super(message, status);
    }

    public static class UploadSizeExceededException extends FileException {
        private static final String MESSAGE =
                "이미지 크기는 " + (FileUploadPolicy.MAX_BYTES / (1024 * 1024)) + "MB 이하여야 합니다.";
        public UploadSizeExceededException() {
            // 서블릿 한도 초과(GlobalExceptionHandler)가 이미 413 이므로, 정책 한도 초과도 413 으로 맞춘다.
            super(MESSAGE, HttpStatus.PAYLOAD_TOO_LARGE);
        }
    }

    public static class UnsupportedFileTypeException extends FileException {
        private static final String MESSAGE = "지원하지 않는 이미지 형식입니다. (JPG, PNG, WEBP만 가능)";
        public UnsupportedFileTypeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class UploadRateLimitedException extends FileException {
        private static final String MESSAGE = "업로드 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
        public UploadRateLimitedException() {
            super(MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
        }
    }
}
