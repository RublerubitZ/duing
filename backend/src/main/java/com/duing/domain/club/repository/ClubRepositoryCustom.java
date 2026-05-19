package com.duing.domain.club.repository;

import com.duing.domain.club.entity.Club;
import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubRepositoryCustom {

    Page<Club> findByCondition(ClubSearchCondition condition, Pageable pageable);

    Page<AdminClubSummaryQuery> findByAdminCondition(AdminClubSearchCondition condition, Pageable pageable);
}
