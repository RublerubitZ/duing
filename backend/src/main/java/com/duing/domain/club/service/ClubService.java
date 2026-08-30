package com.duing.domain.club.service;

import com.duing.domain.club.service.dto.command.CreateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubCentralClubCommand;
import com.duing.domain.club.service.dto.command.UpdateClubFacilitySecuredTimeTargetCommand;
import com.duing.domain.club.service.dto.command.UpdateClubStatusCommand;
import com.duing.domain.club.service.dto.query.AdminClubSearchCondition;
import com.duing.domain.club.service.dto.query.AdminClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubDetailQuery;
import com.duing.domain.club.service.dto.query.ClubSearchCondition;
import com.duing.domain.club.service.dto.query.ClubStatsQuery;
import com.duing.domain.club.service.dto.query.ClubSummaryQuery;
import com.duing.domain.club.service.dto.query.ClubViewer;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface ClubService {

    Long create(CreateClubCommand createClubCommand);

    Page<ClubSummaryQuery> search(ClubSearchCondition condition, Pageable pageable);

    Page<AdminClubSummaryQuery> searchForAdmin(AdminClubSearchCondition condition, Pageable pageable);

    /** 홈 공개 통계 — 총 수·모집중 수·카테고리별 수. 비로그인도 조회한다. */
    ClubStatsQuery getStats();

    ClubDetailQuery getById(Long clubId, ClubViewer viewer);

    /** 학생/공개용 상세 — 운영 중(ACTIVE) 동아리만. 그 외 상태는 ClubNotFoundException(404). */
    ClubDetailQuery getActiveById(Long clubId, ClubViewer viewer);

    void update(UpdateClubCommand updateClubCommand);

    /** 총동연(ADMIN) 전용 프로필 수정 — 리더 멤버십·상태 게이트 없이 조회 가능한 모든 상태의 동아리를 수정한다. */
    void updateAsAdmin(UpdateClubCommand updateClubCommand);

    void updateStatus(UpdateClubStatusCommand updateClubStatusCommand);

    void updateCentralClub(UpdateClubCentralClubCommand updateClubCentralClubCommand);

    /** 총동연(ADMIN) 전용 — 기본 확보 시간 대상 플래그 변경. 실제 변경 시에만 감사 이벤트를 남긴다. */
    void updateFacilitySecuredTimeTarget(UpdateClubFacilitySecuredTimeTargetCommand updateFacilitySecuredTimeTargetCommand);
}
