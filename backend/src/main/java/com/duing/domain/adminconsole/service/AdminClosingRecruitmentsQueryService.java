package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.service.dto.query.AdminClosingRecruitmentsQuery;
import com.duing.domain.recruitment.repository.RecruitmentRepository;
import java.time.Clock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 주간 브리핑 '이번 주 챙길 것'의 모집 줄. 이번 주는 서버 seoulClock 이 정한다 — 화면은 이 응답의 weekStart 로
 * 구역 머리 기간과 이번 주 히트맵 요청 주를 맞춘다(기기 시계가 앞서도 서버 주를 따른다). 줄마다의 표시 상태('기간 종료' 칩)도
 * 같은 시계의 오늘로 서버가 정한다(#896).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AdminClosingRecruitmentsQueryService {

    private final RecruitmentRepository recruitmentRepository;
    private final Clock clock;

    public AdminClosingRecruitmentsQuery getClosingRecruitments() {
        WeekBounds week = WeekBounds.currentWeek(clock);
        return new AdminClosingRecruitmentsQuery(week.firstDay(), LocalDate.now(clock),
                recruitmentRepository.findOpenEndingBetween(week.firstDay(), week.lastDay()));
    }
}
