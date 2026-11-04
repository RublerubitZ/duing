package com.duing.domain.adminconsole.service;

import com.duing.domain.adminconsole.repository.AdminPendingSnapshotRepository;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * 처리 대기 추이의 하루치 기록을 남기는 유일한 곳 — 일별 잡이 부른다.
 *
 * <p>대기 건수 계산은 호출자가 먼저 하고 결과를 넘긴다 — 읽기 전용 서비스를 이 쓰기 트랜잭션 안에서 부르지 않는다.
 * 날짜도 호출자가 넘긴다(잡이 "KST 어제"를 정한다). 집계는 long 이지만 열은 INT 라 넘치면 예외로 멈춘다(조용히 잘리지 않게).
 */
@Component
@RequiredArgsConstructor
public class AdminPendingSnapshotRecorder {

    private final AdminPendingSnapshotRepository adminPendingSnapshotRepository;
    private final Clock clock;

    /** @return 새로 기록했으면 true, 그 날짜가 이미 있으면 false(첫 기록 유지) */
    @Transactional
    public boolean record(LocalDate snapshotDate, AdminPendingCountsQuery pendingCounts) {
        int insertedRows = adminPendingSnapshotRepository.insertIfAbsent(
                snapshotDate,
                Math.toIntExact(pendingCounts.clubApproval()),
                Math.toIntExact(pendingCounts.facilityBooking()),
                Math.toIntExact(pendingCounts.inquiryUnanswered()),
                Math.toIntExact(pendingCounts.promotionRequest()),
                Math.toIntExact(pendingCounts.reportUnresolved()),
                Math.toIntExact(pendingCounts.leaderSuccession()),
                Math.toIntExact(pendingCounts.stalePendingRecruitment()),
                Math.toIntExact(pendingCounts.inactiveClubPending()),
                Math.toIntExact(pendingCounts.totalPendingCount()),
                Instant.now(clock));
        return insertedRows == 1;
    }
}
