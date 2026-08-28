package com.duing.domain.club.service.dto.query;

import com.duing.domain.club.entity.ClubCategory;
import java.util.Map;

/**
 * 공개 동아리 통계 — 홈 히어로 문구와 카테고리 탐색 카운트가 함께 쓴다.
 *
 * @param totalCount      공개(ACTIVE) 동아리 총 수
 * @param recruitingCount 지금 지원 가능한 모집이 있는 동아리 수
 * @param categoryCounts  카테고리별 공개 동아리 수 — 0 인 카테고리도 키가 있다(화면이 8칸을 항상 그린다)
 */
public record ClubStatsQuery(long totalCount, long recruitingCount, Map<ClubCategory, Long> categoryCounts) {
}
