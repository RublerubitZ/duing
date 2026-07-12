package com.duing.domain.recruitment.service;

import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.YearMonth;
import java.util.List;

public interface RecruitmentService {

    Long create(CreateRecruitmentCommand createRecruitmentCommand);

    List<RecruitmentSummaryQuery> getCalendar(YearMonth yearMonth);

    RecruitmentDetailQuery getById(Long recruitmentId);

    List<RecruitmentSummaryQuery> getByClubId(Long clubId);

    void update(UpdateRecruitmentCommand updateRecruitmentCommand);

    void close(Long recruitmentId, Long currentUserId);

    void delete(Long recruitmentId, Long currentUserId);

    Long replaceActive(CreateRecruitmentCommand createRecruitmentCommand);

    List<Long> closeAllOnClubClosure(Long clubId);

    /**
     * 동아리 운영 중단(INACTIVE) 전환 시 OPEN 모집을 일괄 마감한다.
     * 폐쇄(closeAllOnClubClosure)와 달리 soft delete 는 하지 않는다 — 되돌릴 수 있는 상태이므로 기록 보존.
     * @return 마감된 모집 수
     */
    int closeAllOnClubDeactivation(Long clubId);

    void softDeleteAllOnClubClosure(List<Long> recruitmentIds);
}
