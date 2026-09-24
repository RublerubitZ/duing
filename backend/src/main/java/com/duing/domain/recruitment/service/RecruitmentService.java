package com.duing.domain.recruitment.service;

import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.command.UpdateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.LocalDate;
import java.util.List;

public interface RecruitmentService {

    Long create(CreateRecruitmentCommand createRecruitmentCommand);

    /**
     * [from, to] 와 기간이 겹치는 공개 모집을 시작일순으로 반환한다. 양끝 포함, 창은 최대
     * {@code 92}일 — from 이 to 보다 늦거나 창이 넘치면 InvalidCalendarRangeException(400).
     */
    List<RecruitmentSummaryQuery> getCalendar(LocalDate from, LocalDate to);

    RecruitmentDetailQuery getById(Long recruitmentId);

    List<RecruitmentSummaryQuery> getByClubId(Long clubId);

    void update(UpdateRecruitmentCommand updateRecruitmentCommand);

    void close(Long recruitmentId, Long currentUserId);

    void stopIntake(Long recruitmentId, Long currentUserId);

    void delete(Long recruitmentId, Long currentUserId);

    List<Long> closeAllOnClubClosure(Long clubId);

    /**
     * 동아리 운영 중단(INACTIVE) 전환 시 OPEN 모집을 일괄 마감한다.
     * 폐쇄(closeAllOnClubClosure)와 달리 soft delete 는 하지 않는다 — 되돌릴 수 있는 상태이므로 기록 보존.
     * @return 마감된 모집 수
     */
    int closeAllOnClubDeactivation(Long clubId);

    void softDeleteAllOnClubClosure(List<Long> recruitmentIds);
}
