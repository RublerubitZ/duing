package com.duing.domain.club.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** 주요 프로젝트 카드 항목 (JSONB 배열 원소). 순서는 배열 순서가 곧 표시 순서. */
// JSONB 스키마 진화 대비 — 미래 버전이 키를 추가해도 이 버전으로 롤백 시 역직렬화가 깨지지 않게 한다.
@JsonIgnoreProperties(ignoreUnknown = true)
public record ClubProject(
        @NotNull(message = "프로젝트 아이콘은 필수입니다.")
        ProjectIcon icon,

        @NotNull(message = "프로젝트 제목은 필수입니다.")
        @Size(min = 1, max = 30, message = "프로젝트 제목은 1~30자여야 합니다.")
        String title,

        @Size(max = 40, message = "프로젝트 부제목은 40자 이하여야 합니다.")
        String subtitle
) {
    public ClubProject {
        title = title == null ? null : title.strip();
        subtitle = subtitle == null || subtitle.isBlank() ? null : subtitle.strip();
    }
}
