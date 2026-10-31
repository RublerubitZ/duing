package com.duing.domain.adminconsole.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.IntegrationTestBase;
import com.duing.common.TestcontainersConfiguration;
import com.duing.domain.adminconsole.entity.AdminPendingSnapshot;
import com.duing.domain.adminconsole.repository.AdminPendingSnapshotRepository;
import com.duing.domain.adminconsole.service.dto.query.AdminPendingCountsQuery;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@Import(TestcontainersConfiguration.class)
@SpringBootTest
class AdminPendingSnapshotRecorderTest extends IntegrationTestBase {

    private static final LocalDate SNAPSHOT_DATE = LocalDate.of(2026, 10, 28);

    @Autowired AdminPendingSnapshotRecorder adminPendingSnapshotRecorder;
    @Autowired AdminPendingSnapshotRepository adminPendingSnapshotRepository;

    @Test
    @DisplayName("하루치 남은 대기 건수를 영역별 값과 합계 그대로 한 줄 기록한다")
    void recordsAreaCountsAndTotalForTheDate() {
        boolean inserted = adminPendingSnapshotRecorder.record(SNAPSHOT_DATE, AdminPendingCountsQuery.of(1, 2, 3, 4, 5, 6, 7, 8));

        assertThat(inserted).isTrue();
        AdminPendingSnapshot snapshot = adminPendingSnapshotRepository.findById(SNAPSHOT_DATE).orElseThrow();
        assertThat(snapshot.getClubApproval()).isEqualTo(1);
        assertThat(snapshot.getFacilityBooking()).isEqualTo(2);
        assertThat(snapshot.getInquiryUnanswered()).isEqualTo(3);
        assertThat(snapshot.getPromotionRequest()).isEqualTo(4);
        assertThat(snapshot.getReportUnresolved()).isEqualTo(5);
        assertThat(snapshot.getLeaderSuccession()).isEqualTo(6);
        assertThat(snapshot.getStalePendingRecruitment()).isEqualTo(7);
        assertThat(snapshot.getInactiveClubPending()).isEqualTo(8);
        assertThat(snapshot.getTotalPendingCount()).isEqualTo(36);
        assertThat(snapshot.getRecordedAt()).isNotNull();
    }

    @Test
    @DisplayName("같은 날짜를 다시 기록하면 무시하고 첫 기록을 남긴다 — 낮에 다시 돌려도 하루 끝 값이 바뀌지 않는다")
    void keepsFirstRecordWhenTheSameDateIsRecordedAgain() {
        adminPendingSnapshotRecorder.record(SNAPSHOT_DATE, AdminPendingCountsQuery.of(1, 0, 0, 0, 0, 0, 0, 0));

        boolean insertedAgain = adminPendingSnapshotRecorder.record(SNAPSHOT_DATE, AdminPendingCountsQuery.of(9, 9, 9, 9, 9, 9, 9, 0));

        assertThat(insertedAgain).isFalse();
        assertThat(adminPendingSnapshotRepository.count()).isEqualTo(1);
        assertThat(adminPendingSnapshotRepository.findById(SNAPSHOT_DATE).orElseThrow().getTotalPendingCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("기간 조회는 양 끝 날짜를 포함해 날짜 순으로 돌려준다")
    void findsSnapshotsBetweenDatesInclusiveInDateOrder() {
        adminPendingSnapshotRecorder.record(SNAPSHOT_DATE, AdminPendingCountsQuery.of(2, 0, 0, 0, 0, 0, 0, 0));
        adminPendingSnapshotRecorder.record(SNAPSHOT_DATE.minusDays(2), AdminPendingCountsQuery.of(1, 0, 0, 0, 0, 0, 0, 0));
        adminPendingSnapshotRecorder.record(SNAPSHOT_DATE.minusDays(3), AdminPendingCountsQuery.of(5, 0, 0, 0, 0, 0, 0, 0));

        assertThat(adminPendingSnapshotRepository
                .findBySnapshotDateBetweenOrderBySnapshotDateAsc(SNAPSHOT_DATE.minusDays(2), SNAPSHOT_DATE))
                .extracting(AdminPendingSnapshot::getSnapshotDate)
                .containsExactly(SNAPSHOT_DATE.minusDays(2), SNAPSHOT_DATE);
    }
}
