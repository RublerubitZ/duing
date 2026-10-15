package com.duing.domain.club.thumbnail.service;

/** 한 동아리 썸네일 생성 시도의 결과 — 백필이 생성·건너뜀 집계에 쓴다. 예외(스토리지 장애 등)는 결과가 아니라 호출자가 실패로 센다. */
public enum LogoThumbnailOutcome {
    /** 썸네일(또는 작은 원본의 원본 URL)이 동아리에 반영됐다. */
    STORED,
    /** 만들지 않았다 — 자기 스토리지 아님·객체 없음·형식·치수·EXIF 방향. 썸네일은 NULL 그대로. */
    SKIPPED,
    /** 만들었지만 그사이 로고가 바뀌었거나 이미 있거나 폐쇄돼 버렸다(경합) — 만든 객체는 RELEASED 로 남겼다. */
    DISCARDED
}
