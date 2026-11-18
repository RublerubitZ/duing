package com.duing.domain.adminconsole.service.dto.query;

import com.duing.domain.recruitment.service.dto.query.ClosingRecruitmentRow;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 이번 주 모집 기간이 끝나는 모집 — weekStart 는 서버(seoulClock)가 정한 이번 주 월요일, today 는 같은 시계의 오늘(KST 날짜)이며
 * 줄마다의 표시 상태를 정하는 기준이다. undecidedApplicationCounts 는 모집 id 별 결과 안 정한 지원 수(탈퇴한 지원자 제외)이고,
 * 0건인 모집은 키가 없다.
 */
public record AdminClosingRecruitmentsQuery(LocalDate weekStart, LocalDate today, List<ClosingRecruitmentRow> recruitments,
                                            Map<Long, Long> undecidedApplicationCounts) {
}
