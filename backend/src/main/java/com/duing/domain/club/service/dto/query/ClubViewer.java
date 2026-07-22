package com.duing.domain.club.service.dto.query;

/** 상세 조회 요청자 신원 — 대표 연락처 공개 게이트 판정용. 익명은 userId null. */
public record ClubViewer(Long userId, boolean admin) {
    public static ClubViewer anonymous() {
        return new ClubViewer(null, false);
    }
}
