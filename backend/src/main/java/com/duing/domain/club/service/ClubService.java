package com.duing.domain.club.service;

import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCentralClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubViewer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubService {

    Long create(CreateClubCommand createClubCommand);

    Page<ClubSummaryQuery> search(ClubSearchCondition condition, Pageable pageable);

    Page<AdminClubSummaryQuery> searchForAdmin(AdminClubSearchCondition condition, Pageable pageable);

    ClubDetailQuery getById(Long clubId, ClubViewer viewer);

    /** 학생/공개용 상세 — 운영 중(ACTIVE) 동아리만. 그 외 상태는 ClubNotFoundException(404). */
    ClubDetailQuery getActiveById(Long clubId, ClubViewer viewer);

    void update(UpdateClubCommand updateClubCommand);

    /** 총동연(ADMIN) 전용 프로필 수정 — 리더 멤버십·상태 게이트 없이 조회 가능한 모든 상태의 동아리를 수정한다. */
    void updateAsAdmin(UpdateClubCommand updateClubCommand);

    void updateStatus(UpdateClubStatusCommand updateClubStatusCommand);

    void updateCentralClub(UpdateClubCentralClubCommand updateClubCentralClubCommand);
}
