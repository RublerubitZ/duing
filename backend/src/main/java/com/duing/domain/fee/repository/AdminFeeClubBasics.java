package com.duing.domain.fee.repository;

import com.duing.domain.club.entity.ClubStatus;

/**
 * 목록 병합의 기준이 되는 동아리 최소 정보. Club 엔티티를 통째로 읽으면 목록 한 번에
 * 설명·jsonb 컬럼까지 수백 행 딸려오므로 필요한 세 컬럼만 투영한다.
 */
public record AdminFeeClubBasics(Long clubId, String clubName, ClubStatus clubStatus) {
}
