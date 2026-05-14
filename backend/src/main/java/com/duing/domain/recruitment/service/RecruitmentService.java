package com.duing.domain.recruitment.service;

import com.duing.domain.recruitment.service.dto.command.CreateRecruitmentCommand;
import com.duing.domain.recruitment.service.dto.query.RecruitmentDetailQuery;
import com.duing.domain.recruitment.service.dto.query.RecruitmentSummaryQuery;
import java.time.YearMonth;
import java.util.List;

public interface RecruitmentService {

    Long create(CreateRecruitmentCommand createRecruitmentCommand);

    List<RecruitmentSummaryQuery> getCalendar(YearMonth yearMonth);

    RecruitmentDetailQuery getById(Long recruitmentId);
}
