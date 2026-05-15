package com.duing.global.file.controller.dto;

public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo");

    private final String directory;

    FilePurpose(String directory) {
        this.directory = directory;
    }

    public String directory() {
        return directory;
    }
}