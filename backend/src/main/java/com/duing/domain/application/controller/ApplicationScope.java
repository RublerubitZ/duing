package com.duing.domain.application.controller;

import com.duing.domain.application.entity.ApplicationStatus;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * 내 지원 목록 조회 시 status 필터링 범위.
 * - ALL: 모든 상태 (기존 호환 / 기본값)
 * - ACTIVE: ApplicationStatus.isActive() 인 상태
 * - ARCHIVED: ApplicationStatus.isTerminal() 인 상태
 *
 * 매핑은 ApplicationStatus.isActive()/isTerminal() 헬퍼를 사용하여 enum 추가 시 자동 반영된다.
 */
public enum ApplicationScope {
    ALL,
    ACTIVE,
    ARCHIVED;

    public Set<ApplicationStatus> toStatuses() {
        return switch (this) {
            case ALL -> EnumSet.allOf(ApplicationStatus.class);
            case ACTIVE -> collectMatching(ApplicationStatus::isActive);
            case ARCHIVED -> collectMatching(ApplicationStatus::isTerminal);
        };
    }

    private static Set<ApplicationStatus> collectMatching(Predicate<ApplicationStatus> predicate) {
        return Arrays.stream(ApplicationStatus.values())
                .filter(predicate)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(ApplicationStatus.class)));
    }
}
