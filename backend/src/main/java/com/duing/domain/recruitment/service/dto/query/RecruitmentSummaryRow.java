package com.duing.domain.recruitment.service.dto.query;

import com.duing.domain.recruitment.entity.ApplicationMode;
import com.duing.domain.recruitment.entity.RecruitmentStatus;
import com.duing.domain.recruitment.entity.TargetRole;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 공개 모집 목록(캘린더·클럽별)의 스칼라 projection 행.
 *
 * <p>엔티티 {@code Recruitment} 로 목록을 읽으면 mappedBy {@code @OneToOne} form 이 바이트코드
 * 강화 없이는 사실상 eager 라 행마다 questions jsonb SELECT 가 나가고, 요약 조립이 club 프록시를
 * 초기화해 full Club(TEXT·jsonb 포함)까지 로드한다 — 응답에 쓰지 않는 content TEXT 도 실려 온다.
 * 공개 읽기 경로는 이 record 로 필요한 컬럼만 뽑는다(2026-08 성능 감사 P0-3). 쓰기·도메인 로직은
 * 계속 엔티티를 쓴다({@code closeAllOnClubClosure} 등).
 *
 * <p>표시 상태(displayStatus)·모집 중 여부(effectivelyOpen)는 저장 컬럼이 아니라 "오늘" 파생값이라
 * 여기 담지 않는다 — {@link RecruitmentSummaryQuery#from(RecruitmentSummaryRow, LocalDate)} 가
 * 기존 Java 계산으로 도출한다.
 */
public record RecruitmentSummaryRow(
        Long id,
        Long clubId,
        String clubName,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        int capacity,
        RecruitmentStatus status,
        ApplicationMode applicationMode,
        String externalFormUrl,
        boolean useInterview,
        TargetRole targetRole,
        LocalDateTime closedAt
) {
}
