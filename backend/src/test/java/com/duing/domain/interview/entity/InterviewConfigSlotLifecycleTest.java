package com.duing.domain.interview.entity;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class InterviewConfigSlotLifecycleTest {

    private static final Long RECRUITMENT_ID = 1L;
    private static final LocalDateTime DEADLINE = LocalDateTime.of(2026, 6, 15, 18, 0);
    private static final LocalDateTime BEFORE_DEADLINE = DEADLINE.minusHours(1);
    private static final LocalDateTime AFTER_DEADLINE = DEADLINE.plusHours(1);

    @Test
    @DisplayName("마감 전(phase 1) 에는 슬롯을 추가할 수 있다")
    void canCreateSlot_phase1_returnsTrue() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canCreateSlot(BEFORE_DEADLINE)).isTrue();
    }

    @Test
    @DisplayName("마감 후 자동배정 전(phase 2) 에도 운영진 직권 배정용으로 슬롯을 추가할 수 있다")
    void canCreateSlot_phase2_returnsTrue() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canCreateSlot(AFTER_DEADLINE)).isTrue();
    }

    @Test
    @DisplayName("자동배정 완료(phase 3) 후에는 슬롯을 추가할 수 없다")
    void canCreateSlot_phase3_returnsFalse() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);
        config.markAssignmentCompleted(AFTER_DEADLINE);

        assertThat(config.canCreateSlot(AFTER_DEADLINE)).isFalse();
    }

    @Test
    @DisplayName("phase 1 + 빈 슬롯은 시간/정원 모두 수정할 수 있다")
    void canModifySlot_phase1_emptySlot_allowsTimeAndCapacity() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canModifySlot(0, BEFORE_DEADLINE))
                .isEqualTo(InterviewConfig.SlotMutableFields.TIME_AND_CAPACITY);
    }

    @Test
    @DisplayName("phase 1 + 지원자가 선택한 슬롯은 정원만 수정할 수 있다")
    void canModifySlot_phase1_selectedSlot_capacityOnly() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canModifySlot(3, BEFORE_DEADLINE))
                .isEqualTo(InterviewConfig.SlotMutableFields.CAPACITY_ONLY);
    }

    @Test
    @DisplayName("phase 2 + 지원자가 선택한 슬롯은 시간/정원 모두 변경할 수 없다")
    void canModifySlot_phase2_selectedSlot_none() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canModifySlot(2, AFTER_DEADLINE))
                .isEqualTo(InterviewConfig.SlotMutableFields.NONE);
    }

    @Test
    @DisplayName("phase 2 + 빈 슬롯은 시간/정원 모두 수정할 수 있다")
    void canModifySlot_phase2_emptySlot_timeAndCapacity() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canModifySlot(0, AFTER_DEADLINE))
                .isEqualTo(InterviewConfig.SlotMutableFields.TIME_AND_CAPACITY);
    }

    @Test
    @DisplayName("phase 3 에서는 빈 슬롯이든 선택된 슬롯이든 어떤 필드도 수정할 수 없다")
    void canModifySlot_phase3_none() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);
        config.markAssignmentCompleted(AFTER_DEADLINE);

        assertThat(config.canModifySlot(0, AFTER_DEADLINE))
                .isEqualTo(InterviewConfig.SlotMutableFields.NONE);
        assertThat(config.canModifySlot(5, AFTER_DEADLINE))
                .isEqualTo(InterviewConfig.SlotMutableFields.NONE);
    }

    @Test
    @DisplayName("phase 1 + 빈 슬롯은 삭제할 수 있다")
    void canDeleteSlot_phase1_emptySlot_returnsTrue() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canDeleteSlot(0, BEFORE_DEADLINE)).isTrue();
    }

    @Test
    @DisplayName("phase 2 + 지원자가 선택한 슬롯은 삭제할 수 없다")
    void canDeleteSlot_phase2_selectedSlot_returnsFalse() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);

        assertThat(config.canDeleteSlot(2, AFTER_DEADLINE)).isFalse();
    }

    @Test
    @DisplayName("phase 3 에서는 빈 슬롯이든 선택된 슬롯이든 삭제할 수 없다")
    void canDeleteSlot_phase3_anyCount_returnsFalse() {
        InterviewConfig config = InterviewConfig.create(RECRUITMENT_ID, DEADLINE);
        config.markAssignmentCompleted(AFTER_DEADLINE);

        assertThat(config.canDeleteSlot(0, AFTER_DEADLINE)).isFalse();
        assertThat(config.canDeleteSlot(3, AFTER_DEADLINE)).isFalse();
    }
}
