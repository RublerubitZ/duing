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

    Long replaceActive(CreateRecruitmentCommand createRecruitmentCommand);

    List<Long> closeAllOnClubClosure(Long clubId);
}
