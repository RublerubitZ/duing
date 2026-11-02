package com.duing.domain.adminconsole.service.dto.query;

import com.duing.domain.recruitment.service.dto.query.ClosingRecruitmentRow;
import java.time.LocalDate;
import java.util.List;

/** 이번 주 모집 기간이 끝나는 모집 — weekStart 는 서버(seoulClock)가 정한 이번 주 월요일이다. */
public record AdminClosingRecruitmentsQuery(LocalDate weekStart, List<ClosingRecruitmentRow> recruitments) {
}
