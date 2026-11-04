package com.duing.domain.clubmember.repository;

import com.duing.global.time.TimeMapper;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Collection;

/**
 * Native query 결과를 바인딩하는 Spring Data interface projection.
 * {@link ClubMemberRepository#findOperatorActivityByClubIds(Collection)} 에서 사용한다.
 */
public interface OperatorActivityRow {

    Long getClubId();

    /** 운영진 세션의 마지막 사용 시각 최대값 — seoul regime 벽시계다(TIMEZONE.md). */
    LocalDateTime getLastSessionUsedAt();

    /** 운영진의 마지막 로그인 시각 최대값 — system regime 벽시계다(TIMEZONE.md). */
    LocalDateTime getLastLoginAt();

    /**
     * 운영진 마지막 접속 — 세션 사용(seoul)·로그인(system)을 각각 절대시각으로 바꾼 뒤 늦은 값, 둘 다 없으면 null.
     * 벽시계 그대로 비교하면 prod(JVM=UTC)에서 9시간 어긋난다. 총동연 모집 목록(GeneralAdminRecruitmentQueryService#laterOf)과 같은 규칙이다.
     */
    default Instant lastActiveAt() {
        Instant sessionUsedAt = TimeMapper.seoulWallClockToInstant(getLastSessionUsedAt());
        Instant loggedInAt = TimeMapper.systemWallClockToInstant(getLastLoginAt());
        if (sessionUsedAt == null || loggedInAt == null) {
            return sessionUsedAt == null ? loggedInAt : sessionUsedAt;
        }
        return sessionUsedAt.isAfter(loggedInAt) ? sessionUsedAt : loggedInAt;
    }
}
