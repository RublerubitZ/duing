package com.duing.domain.clubmember.repository;

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
}
