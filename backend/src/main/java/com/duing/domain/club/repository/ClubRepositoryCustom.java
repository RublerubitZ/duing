package com.duing.domain.club.repository;

import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubRepositoryCustom {

    /** 탐색 목록 전용 조회 — 카드가 쓰는 컬럼만 읽는다(대표 모집은 서비스에서 별도 조회로 채운다). */
    Page<ClubSummaryQuery> findByCondition(ClubSearchCondition condition, Pageable pageable);

    Page<AdminClubSummaryQuery> findByAdminCondition(AdminClubSearchCondition condition, Pageable pageable);
}
