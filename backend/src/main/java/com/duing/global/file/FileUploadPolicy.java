package com.duing.global.file;

import java.util.Set;

public final class FileUploadPolicy {

    public static final long MAX_BYTES = 5L * 1024 * 1024;

    public static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "image/jpeg",
            "image/png",
            "image/webp"
    );

    private FileUploadPolicy() {
    }
}
