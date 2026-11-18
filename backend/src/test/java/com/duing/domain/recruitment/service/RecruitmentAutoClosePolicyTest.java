package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.fixture.ClubFixture;
import com.duing.domain.recruitment.entity.Recruitment;
import com.duing.domain.recruitment.service.dto.query.AutoCloseOutlookQuery;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecruitmentAutoClosePolicyTest {

    private static final LocalDate END_DATE = LocalDate.of(2026, 11, 30);
    private static final LocalDate CLOSES_ON = LocalDate.of(2026, 12, 8);

    private static Recruitment recruitmentEndingOn(LocalDate endDate) {
        LocalDate startDate = endDate == null ? LocalDate.of(2026, 9, 1) : endDate.minusDays(14);
        return Recruitment.create(ClubFixture.academic("전망동아리"), "모집", "내용", startDate, endDate, 10);
    }

    @Test
    @DisplayName("자동 마감 첫날은 종료일 다음 날부터 유예 7일이 지난 날이고, 잡의 후보 조회 경계와 같다")
    void closesOnMatchesCandidateBoundary() {
        LocalDate closesOn = RecruitmentAutoClosePolicy.closesOn(END_DATE);

        assertThat(closesOn).isEqualTo(CLOSES_ON);
        assertThat(END_DATE.isBefore(RecruitmentAutoClosePolicy.endedBefore(closesOn)))
                .as("자동 마감 첫날에는 후보다").isTrue();
        assertThat(END_DATE.isBefore(RecruitmentAutoClosePolicy.endedBefore(closesOn.minusDays(1))))
                .as("그 전날에는 아직 후보가 아니다").isFalse();
    }

    @Test
    @DisplayName("기간이 끝난 OPEN 모집이 아니면 전망은 없다 — 마감된 모집·상시모집·오늘 끝나는 모집·기간 중 모집")
    void noOutlookUnlessExpiredOpen() {
        Recruitment closed = recruitmentEndingOn(END_DATE);
        closed.close(CLOSES_ON.atStartOfDay());

        assertThat(RecruitmentAutoClosePolicy.outlook(closed, CLOSES_ON, 0, 0)).isNull();
        assertThat(RecruitmentAutoClosePolicy.outlook(recruitmentEndingOn(null), CLOSES_ON, 0, 0)).isNull();
        assertThat(RecruitmentAutoClosePolicy.outlook(recruitmentEndingOn(CLOSES_ON), CLOSES_ON, 0, 0)).isNull();
        assertThat(RecruitmentAutoClosePolicy.outlook(recruitmentEndingOn(CLOSES_ON.plusDays(3)), CLOSES_ON, 0, 0))
                .isNull();
    }

    @Test
    @DisplayName("자동 마감 첫날부터 유예가 끝난 것으로 보고, 그 전날까지는 유예 중이다")
    void gracePeriodIsOverFromClosesOn() {
        Recruitment recruitment = recruitmentEndingOn(END_DATE);

        AutoCloseOutlookQuery dayBefore = RecruitmentAutoClosePolicy.outlook(recruitment, CLOSES_ON.minusDays(1), 0, 0);
        AutoCloseOutlookQuery onTheDay = RecruitmentAutoClosePolicy.outlook(recruitment, CLOSES_ON, 0, 0);

        assertThat(dayBefore).isEqualTo(new AutoCloseOutlookQuery(CLOSES_ON, false, 0, 0));
        assertThat(dayBefore.closable()).isFalse();
        assertThat(onTheDay).isEqualTo(new AutoCloseOutlookQuery(CLOSES_ON, true, 0, 0));
        assertThat(onTheDay.closable()).isTrue();
    }

    @Test
    @DisplayName("결과 없는 지원이나 진행 중 면접 라운드가 하나라도 있으면 막혀서, 유예가 끝나도 닫을 수 없다")
    void anyBlockerPreventsClosing() {
        Recruitment recruitment = recruitmentEndingOn(END_DATE);

        AutoCloseOutlookQuery undecided = RecruitmentAutoClosePolicy.outlook(recruitment, CLOSES_ON, 2, 0);
        AutoCloseOutlookQuery round = RecruitmentAutoClosePolicy.outlook(recruitment, CLOSES_ON, 0, 1);

        assertThat(undecided.blocked()).isTrue();
        assertThat(undecided.closable()).isFalse();
        assertThat(round.blocked()).isTrue();
        assertThat(round.closable()).isFalse();
    }
}
