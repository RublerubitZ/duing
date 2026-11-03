package com.duing.domain.recruitment.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecruitmentAutoClosePolicyTest {

    @Test
    @DisplayName("자동 마감 첫날은 종료일 다음 날부터 유예 7일이 지난 날이고, 잡의 후보 조회 경계와 같다")
    void closesOnMatchesCandidateBoundary() {
        LocalDate endDate = LocalDate.of(2026, 11, 30);

        LocalDate closesOn = RecruitmentAutoClosePolicy.closesOn(endDate);

        assertThat(closesOn).isEqualTo(LocalDate.of(2026, 12, 8));
        assertThat(endDate.isBefore(RecruitmentAutoClosePolicy.endedBefore(closesOn)))
                .as("자동 마감 첫날에는 후보다").isTrue();
        assertThat(endDate.isBefore(RecruitmentAutoClosePolicy.endedBefore(closesOn.minusDays(1))))
                .as("그 전날에는 아직 후보가 아니다").isFalse();
    }
}
