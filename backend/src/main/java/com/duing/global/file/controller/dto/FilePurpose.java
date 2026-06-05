package com.duing.global.file.controller.dto;

public enum FilePurpose {
    LOGO("club/logo"),
    COVER("club/cover"),
    PHOTO("club/photo"),
    NOTICE_COVER("notice/cover"),
    PROMOTION_BANNER("promotion/banner"),
    GLOBAL_EVENT_COVER("global-event/cover");

    private final String directory;

    FilePurpose(String directory) {
        this.directory = directory;
    }

    public String directory() {
        return directory;
    }
}