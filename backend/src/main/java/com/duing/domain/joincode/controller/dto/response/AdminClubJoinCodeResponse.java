package com.duing.domain.joincode.controller.dto.response;

import com.duing.domain.joincode.entity.AdminJoinCodeStatus;
import com.duing.domain.joincode.entity.JoinCodeLinkType;
import com.duing.domain.joincode.service.dto.query.AdminClubJoinCodeRow;
import com.duing.global.time.TimeMapper;
import java.time.Instant;

/**
 * 총동연 가입 링크 목록 행 응답.
 *
 * <p>운영진 화면({@link JoinCodeResponse})과 달리 활성 링크만이 아니라 폐기·만료·소진된 링크까지
 * 전부 싣는다 — 총동연이 보는 것은 "지금 쓸 수 있는 링크"가 아니라 이 동아리가 만든 링크의 이력이다.
 * 상태는 서버가 {@code status} 로 한 번 판정해 내려보내고 화면은 그대로 적는다.
 *
 * <p>{@code code} 는 링크 값 그 자체(가입 자격)라 감사 detail 에는 싣지 않지만, 이 목록은 총동연이
 * 강제 폐기 대상을 지목하는 화면이라 어떤 링크인지 식별할 수 있어야 해 그대로 내려간다.
 *
 * <p>시각 regime 이 필드마다 갈린다: {@code createdAt} 은 JPA 감사 필드(system), 나머지 세 시각은
 * seoulClock 벽시계다(/TIMEZONE.md). {@code inviteExpiresAt} 은 초대 링크에만 값이 있고,
 * {@code joinExpiresAt} 은 두 형태의 사용 기한 단일 출처다(모집 진행 중이면 아직 정해지지 않아 null).
 */
public record AdminClubJoinCodeResponse(
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
        Instant joinExpiresAt,
        Instant inviteExpiresAt,
        AdminJoinCodeStatus status,
        Instant createdAt,
        Long createdById,
        String createdByName,
        Instant revokedAt,
        Long revokedById,
        String revokedByName
) {
    public static AdminClubJoinCodeResponse from(AdminClubJoinCodeRow joinCodeRow) {
        return new AdminClubJoinCodeResponse(
                joinCodeRow.joinCodeId(),
                joinCodeRow.linkType(),
                joinCodeRow.code(),
                joinCodeRow.recruitmentId(),
                joinCodeRow.recruitmentTitle(),
                joinCodeRow.generation(),
                joinCodeRow.maxUses(),
                joinCodeRow.usedCount(),
                joinCodeRow.totalRequestCount(),
                joinCodeRow.pendingCount(),
                joinCodeRow.autoApprove(),
                joinCodeRow.joinWindowDays(),
                // 사용 기한·만료·폐기 시각은 seoulClock 벽시계다(TIMEZONE.md — seoul regime).
                TimeMapper.seoulWallClockToInstant(joinCodeRow.joinExpiresAt()),
                TimeMapper.seoulWallClockToInstant(joinCodeRow.inviteExpiresAt()),
                joinCodeRow.status(),
                // createdAt 은 JPA 감사 필드라 JVM 존 벽시계다(TIMEZONE.md — system regime).
                TimeMapper.systemWallClockToInstant(joinCodeRow.createdAt()),
                joinCodeRow.createdById(),
                joinCodeRow.createdByName(),
                TimeMapper.seoulWallClockToInstant(joinCodeRow.revokedAt()),
                joinCodeRow.revokedById(),
                joinCodeRow.revokedByName()
        );
    }
}
