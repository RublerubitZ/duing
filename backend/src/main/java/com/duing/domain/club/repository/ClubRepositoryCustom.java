package com.duing.domain.club.repository;

import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSignalSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubStatsQuery;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubRepositoryCustom {

    /** 탐색 목록 전용 조회 — 카드가 쓰는 컬럼만 읽는다(대표 모집은 서비스에서 별도 조회로 채운다). */
    Page<ClubSummaryQuery> findByCondition(ClubSearchCondition condition, Pageable pageable);

    Page<AdminClubSummaryQuery> findByAdminCondition(AdminClubSearchCondition condition, Pageable pageable);

    /** 홈 공개 통계 — 총 수·모집중 수·카테고리별 수를 한 번에 센다. */
    ClubStatsQuery countStats();

    /**
     * 정리할 남은 미결(결과 미정 지원서·대기 가입 신청)이 있는 운영 중단 동아리 수 — 총동연 홈 처리 대기 집계용.
     * 목록 필터(needsPendingCleanup=true)의 totalElements 와 같은 식을 쓴다(스펙 §3-1).
     */
    long countInactiveClubsWithPendingItems();

    /**
     * 총동연 홈 동아리 현황 — 운영 중 수 + 신호 넷(동아리 신호 스펙 §6-2). 목록 신호 필터와 같은 행 술어·같은 기준 식을 쓴다.
     * 운영 중 1 + 기록 없음 1 + 운영진 미접속 1 + 결과 대기 모집 행 1 + 가입 대기 GROUP BY 1 = 5쿼리.
     */
    ClubSignalSummaryQuery summarizeSignals();
}
