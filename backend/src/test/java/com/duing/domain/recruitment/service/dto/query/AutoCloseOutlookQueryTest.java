package com.duing.domain.recruitment.service.dto.query;

import static org.assertj.core.api.Assertions.assertThat;

import com.duing.common.fixture.ClubFixture;
import com.duing.domain.recruitment.entity.Recruitment;
import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class AutoCloseOutlookQueryTest {

    private static final LocalDate END_DATE = LocalDate.of(2026, 11, 30);
    private static final LocalDate CLOSES_ON = LocalDate.of(2026, 12, 8);

    private static Recruitment recruitmentEndingOn(LocalDate endDate) {
        LocalDate startDate = endDate == null ? LocalDate.of(2026, 9, 1) : endDate.minusDays(14);
        return Recruitment.create(ClubFixture.academic("전망동아리"), "모집", "내용", startDate, endDate, 10);
    }

    @Test
    @DisplayName("기간이 끝난 OPEN 모집이 아니면 전망은 없다 — 마감된 모집·상시모집·오늘 끝나는 모집·기간 중 모집")
    void noOutlookUnlessExpiredOpen() {
        Recruitment closed = recruitmentEndingOn(END_DATE);
        closed.close(CLOSES_ON.atStartOfDay());

        assertThat(AutoCloseOutlookQuery.assemble(closed, CLOSES_ON, 0, 0)).isNull();
        assertThat(AutoCloseOutlookQuery.assemble(recruitmentEndingOn(null), CLOSES_ON, 0, 0)).isNull();
        assertThat(AutoCloseOutlookQuery.assemble(recruitmentEndingOn(CLOSES_ON), CLOSES_ON, 0, 0)).isNull();
        assertThat(AutoCloseOutlookQuery.assemble(recruitmentEndingOn(CLOSES_ON.plusDays(3)), CLOSES_ON, 0, 0))
                .isNull();
    }

    @Test
    @DisplayName("자동 마감 첫날부터 유예가 끝난 것으로 보고, 그 전날까지는 유예 중이다")
    void gracePeriodIsOverFromClosesOn() {
        Recruitment recruitment = recruitmentEndingOn(END_DATE);

        AutoCloseOutlookQuery dayBefore =
                AutoCloseOutlookQuery.assemble(recruitment, CLOSES_ON.minusDays(1), 0, 0);
        AutoCloseOutlookQuery onTheDay = AutoCloseOutlookQuery.assemble(recruitment, CLOSES_ON, 0, 0);

        assertThat(dayBefore.closesOn()).isEqualTo(CLOSES_ON);
        assertThat(dayBefore.gracePeriodOver()).isFalse();
        assertThat(dayBefore.closable()).isFalse();
        assertThat(onTheDay.closesOn()).isEqualTo(CLOSES_ON);
        assertThat(onTheDay.gracePeriodOver()).isTrue();
        assertThat(onTheDay.closable()).isTrue();
    }

    @Test
    @DisplayName("결과 없는 지원이나 진행 중 면접 라운드가 하나라도 있으면 막혀서, 유예가 끝나도 닫을 수 없다")
    void anyBlockerPreventsClosing() {
        Recruitment recruitment = recruitmentEndingOn(END_DATE);

        AutoCloseOutlookQuery undecided = AutoCloseOutlookQuery.assemble(recruitment, CLOSES_ON, 2, 0);
        AutoCloseOutlookQuery round = AutoCloseOutlookQuery.assemble(recruitment, CLOSES_ON, 0, 1);

        assertThat(undecided.undecidedApplicationCount()).isEqualTo(2);
        assertThat(undecided.blocked()).isTrue();
        assertThat(undecided.closable()).isFalse();
        assertThat(round.inProgressRoundCount()).isEqualTo(1);
        assertThat(round.blocked()).isTrue();
        assertThat(round.closable()).isFalse();
    }
}
