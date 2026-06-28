package com.duing.domain.notice.service.dto.query;

/**
 * 공지 피드의 출처 필터. 데이터 모델은 단일 notice 테이블을 그대로 쓰며,
 * owning_club_id 의 null 여부로 출처를 구분한다.
 * - SCHOOL: 관리자(학교/플랫폼)가 작성한 공지 (owning_club_id IS NULL)
 * - CLUB:   동아리가 작성한 공지 (owning_club_id IS NOT NULL) — 가시성 로직이 본인 가입 동아리로 제한
 */
public enum NoticeSource {
    SCHOOL,
    CLUB
}
