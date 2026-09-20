package com.duing.domain.joincode.service.dto.query;

import com.duing.domain.joincode.entity.AdminJoinCodeStatus;
import com.duing.domain.joincode.entity.JoinCodeLinkType;
import java.time.LocalDateTime;

/**
 * 총동연 가입 링크 목록 행 — 동아리의 링크 2종(모집 링크·부원 초대)을 폐기·만료·소진까지 모두 담는다.
 *
 * <p>{@code recruitmentTitle}·{@code createdByName}·{@code revokedByName} 은 조회 시점 조인이라
 * 대상이 삭제·탈퇴했으면 null 이다 — 링크 행 자체는 감사 이력으로 남으므로 이름만 비운다.
 *
 * <p>시각은 저장 벽시계 원본이며 절대시각 환산은 응답 경계가 한다. {@code createdAt} 만 JPA 감사 필드
 * (system regime)이고 나머지 세 시각은 seoulClock 벽시계다(/TIMEZONE.md).
 */
public record AdminClubJoinCodeRow(
        Long joinCodeId,
        JoinCodeLinkType linkType,
        String code,
        Long recruitmentId,
        String recruitmentTitle,
        Integer generation,
        int maxUses,
        int usedCount,
        long totalRequestCount,
        long pendingCount,
        boolean autoApprove,
        int joinWindowDays,
        LocalDateTime joinExpiresAt,
        LocalDateTime inviteExpiresAt,
        AdminJoinCodeStatus status,
        LocalDateTime createdAt,
        Long createdById,
        String createdByName,
        LocalDateTime revokedAt,
        Long revokedById,
        String revokedByName
) {
}
