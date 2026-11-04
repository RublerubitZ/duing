package com.duing.domain.club.service.dto.query;

/** 운영 중단 동아리 남은 미결 정리 결과 — 실제로 처리한 건수다(화면 확인 창의 건수는 목록을 받은 시점 값이라 다를 수 있다). */
public record ClubPendingCleanupResult(
        int rejectedApplicationCount,
        int rejectedJoinRequestCount
) {
}
