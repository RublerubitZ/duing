package com.duing.domain.user.service.dto.command;

/**
 * 관리자 강제 로그아웃 입력. {@code targetUserId} 의 모든 토큰을 무효화하며, {@code actorUserId} 는 수행한 관리자(운영 로그용).
 */
public record ForceLogoutCommand(
        Long targetUserId,
        Long actorUserId
) {}
