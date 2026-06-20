package com.duing.domain.notification.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class RecruitmentDeadlineLabelTest {

    @Test
    @DisplayName("마감일이 있으면 '마감 {날짜}' 로 표기된다")
    void formatsDeadlineWhenEndDatePresent() {
        assertThat(RecruitmentDeadlineLabel.of(LocalDate.of(2026, 6, 30)))
                .isEqualTo("마감 2026-06-30");
    }

    @Test
    @DisplayName("마감일이 없는 상시모집은 '상시 모집' 으로 표기된다")
    void formatsAlwaysOpenWhenEndDateNull() {
        assertThat(RecruitmentDeadlineLabel.of(null)).isEqualTo("상시 모집");
    }
}
