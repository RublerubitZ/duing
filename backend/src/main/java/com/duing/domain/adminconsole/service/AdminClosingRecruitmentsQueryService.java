package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.service.dto.query.AdminClosingRecruitmentsQuery;
import com.duing.domain.application.entity.ApplicationStatus;
import com.duing.domain.application.repository.ApplicationRepository;
import com.duing.domain.recruitment.repository.RecruitmentCountRow;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import com.duing.domain.recruitment.service.dto.query.ClosingRecruitmentRow;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주간 브리핑 '이번 주 챙길 것'의 모집 줄. 이번 주는 서버 seoulClock 이 정한다 — 화면은 이 응답의 weekStart 로
 * 구역 머리 기간과 이번 주 히트맵 요청 주를 맞춘다(기기 시계가 앞서도 서버 주를 따른다). 줄마다의 표시 상태('기간 종료' 칩)도
 * 같은 시계의 오늘로 서버가 정한다(#896).
 *
 * <p>결과 안 정한 지원 수는 자동 마감 전망과 같은 집계 쿼리로 센다 — 총동연 모집 목록의 지원자 수·자동 마감 안내처럼 탈퇴한
 * 지원자의 지원서를 빼, 같은 모집이 화면마다 다른 수가 되지 않게 한다.
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminClosingRecruitmentsQueryService {

    private final RecruitmentRepository recruitmentRepository;
    private final ApplicationRepository applicationRepository;
    private final Clock clock;

    public AdminClosingRecruitmentsQuery getClosingRecruitments() {
        WeekBounds week = WeekBounds.currentWeek(clock);
        List<ClosingRecruitmentRow> closingRows = recruitmentRepository.findOpenEndingBetween(week.firstDay(), week.lastDay());
        return new AdminClosingRecruitmentsQuery(week.firstDay(), LocalDate.now(clock), closingRows,
                undecidedApplicationCounts(closingRows));
    }

    private Map<Long, Long> undecidedApplicationCounts(List<ClosingRecruitmentRow> closingRows) {
        if (closingRows.isEmpty()) {
            // 집계 쿼리의 IN () 을 피한다.
            return Map.of();
        }
        return applicationRepository.countByRecruitmentIdsAndStatusInExcludingWithdrawnApplicants(
                        closingRows.stream().map(ClosingRecruitmentRow::recruitmentId).toList(),
                        ApplicationStatus.activeSet())
                .stream()
                .collect(Collectors.toMap(RecruitmentCountRow::getRecruitmentId, RecruitmentCountRow::getItemCount));
    }
}
