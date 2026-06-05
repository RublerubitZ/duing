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
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }

    public static class UnsupportedFileTypeException extends FileException {
        private static final String MESSAGE = "지원하지 않는 이미지 형식입니다. (JPG, PNG, WEBP만 가능)";
        public UnsupportedFileTypeException() {
            super(MESSAGE, HttpStatus.BAD_REQUEST);
        }
    }
}
