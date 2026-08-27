package com.duing.domain.facility.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import com.duing.domain.facility.parser.ParsedReservation;
import com.duing.domain.facility.service.SlotMerger.MergedSlot;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class SlotMergerTest {

    private final SlotMerger merger = new SlotMerger();
    private final LocalDate day = LocalDate.of(2026, 7, 1);

    private ParsedReservation slot(long seq, String org, int startHour, int endHour) {
        return new ParsedReservation(seq, day, LocalTime.of(startHour, 0), LocalTime.of(endHour, 0), org);
    }

    @Test
    @DisplayName("같은 날짜·단체의 인접 슬롯 09-10·10-11·11-12 는 09-12 하나로 병합된다")
    void mergesAdjacentSameOrgChain() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "댄스동아리", 9, 10), slot(2, "댄스동아리", 10, 11), slot(3, "댄스동아리", 11, 12)));
        assertThat(merged).hasSize(1);
        assertThat(merged.get(0).start()).isEqualTo(LocalTime.of(9, 0));
        assertThat(merged.get(0).end()).isEqualTo(LocalTime.of(12, 0));
        assertThat(merged.get(0).organization()).isEqualTo("댄스동아리");
    }

    @Test
    @DisplayName("같은 단체라도 비인접(09-10·19-20)이면 병합되지 않고 2건으로 유지된다")
    void keepsNonAdjacentSplit() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "고정관념", 9, 10), slot(2, "고정관념", 19, 20)));
        assertThat(merged).extracting(MergedSlot::start, MergedSlot::end)
                .containsExactly(tuple(LocalTime.of(9, 0), LocalTime.of(10, 0)),
                        tuple(LocalTime.of(19, 0), LocalTime.of(20, 0)));
    }

    @Test
    @DisplayName("인접하지만 단체가 다르면 병합되지 않는다")
    void doesNotMergeDifferentOrg() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "A동아리", 9, 10), slot(2, "B동아리", 10, 11)));
        assertThat(merged).hasSize(2);
    }

    @Test
    @DisplayName("하이픈 실예약 범위 확장으로 같은 구간이 된 마커 행 2건(10-17·10-17)은 한 건으로 접힌다")
    void collapsesDuplicateExpandedRangeRows() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "학생생활상담센터", 10, 17), slot(2, "학생생활상담센터", 10, 17)));
        assertThat(merged).hasSize(1);
        assertThat(merged.get(0).start()).isEqualTo(LocalTime.of(10, 0));
        assertThat(merged.get(0).end()).isEqualTo(LocalTime.of(17, 0));
    }

    @Test
    @DisplayName("같은 날짜·단체의 겹치는 슬롯(09-12·10-11·11-13)은 늦은 끝시각 기준 09-13 하나로 병합된다")
    void mergesOverlappingSlotsKeepingLatestEnd() {
        List<MergedSlot> merged = merger.merge(List.of(
                slot(1, "고정관념", 9, 12), slot(2, "고정관념", 10, 11), slot(3, "고정관념", 11, 13)));
        assertThat(merged).hasSize(1);
        assertThat(merged.get(0).start()).isEqualTo(LocalTime.of(9, 0));
        assertThat(merged.get(0).end()).isEqualTo(LocalTime.of(13, 0));
    }

    @Test
    @DisplayName("같은 단체·인접 시각이라도 날짜가 다르면 병합되지 않는다")
    void doesNotMergeDifferentDate() {
        ParsedReservation d1 = new ParsedReservation(1, LocalDate.of(2026, 7, 1), LocalTime.of(23, 0), LocalTime.of(23, 59), "A");
        ParsedReservation d2 = new ParsedReservation(2, LocalDate.of(2026, 7, 2), LocalTime.of(9, 0), LocalTime.of(10, 0), "A");
        assertThat(merger.merge(List.of(d1, d2))).hasSize(2);
    }
}
