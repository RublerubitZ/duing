package com.duing.domain.facilitybooking.entity;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class BookingStatusSetTest {

    @Test
    @DisplayName("슬롯 차단·상한 집계 집합은 각 술어(blocksSlot/countsTowardActiveCap)의 파생과 일치한다")
    void derivedSetsMatchPredicates() {
        assertThat(BookingStatus.slotBlockingStatuses())
                .containsExactlyInAnyOrder(BookingStatus.APPROVED, BookingStatus.CONFIRMED);
        assertThat(BookingStatus.activeCapStatuses())
                .containsExactlyInAnyOrder(BookingStatus.PENDING, BookingStatus.APPROVED);
    }

    @Test
    @DisplayName("정상 경로 집합은 CONFLICT 를 제외한다 — 비종결(isTerminal 부정) 집합과 같지 않다")
    void normalPathExcludesConflict() {
        // CONFLICT 는 비종결이지만 충돌 해소 대기 상태라 정상 경로가 아니다. 이 집합을
        // isTerminal 부정으로 '단순화'하면 클럽 중복 차단·가용성 조회에 CONFLICT 가 섞이는 동작 변경이 된다.
        assertThat(BookingStatus.normalPathStatuses())
                .containsExactlyInAnyOrder(BookingStatus.PENDING, BookingStatus.APPROVED, BookingStatus.CONFIRMED);
        assertThat(BookingStatus.CONFLICT.isTerminal()).isFalse();
    }
}
