package com.duing.domain.facility.parser;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ReservationParserTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ReservationParser parser = new ReservationParser();

    private JsonNode loadFixture(String name) throws IOException {
        try (InputStream in = getClass().getResourceAsStream("/facility/" + name)) {
            return objectMapper.readTree(in);
        }
    }

    @Test
    @DisplayName("room4 픽스처: 중복 schedule_seq 를 distinct 하고 dept 꼬리 시간표기를 제거하며 date/time 을 조립한다")
    void parsesRoom4() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room4.json"), YearMonth.of(2026, 7));

        // schedule_seq 18141 중복 1건 제거 → 4건
        assertThat(reservations).hasSize(4);
        assertThat(reservations).extracting(ParsedReservation::scheduleSeq)
                .containsExactlyInAnyOrder(18134L, 18135L, 18140L, 18141L);

        ParsedReservation first = reservations.stream().filter(r -> r.scheduleSeq() == 18134L).findFirst().orElseThrow();
        assertThat(first.organizationName()).isEqualTo("고정관념"); // "(9:00~20:00)" 제거
        assertThat(first.reservationDate()).isEqualTo(LocalDate.of(2026, 7, 1)); // date "01" + 2026-07
        assertThat(first.startTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(first.endTime()).isEqualTo(LocalTime.of(10, 0));
    }

    @Test
    @DisplayName("dept 꼬리 (9:00~20:00) 운영시간은 제거 전에 추출되어 reservedStart/End 로 담기고 표기 없는 단체는 null 이다")
    void extractsOperatingHoursFromTrailingTime() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room4.json"), YearMonth.of(2026, 7));

        // "고정관념(9:00~20:00)" — 슬롯 두 건 모두 동일한 운영시간을 담는다(조직명 정리는 기존 유지).
        List<ParsedReservation> operatingHourRows = reservations.stream()
                .filter(row -> row.organizationName().equals("고정관념")).toList();
        assertThat(operatingHourRows).hasSize(2);
        assertThat(operatingHourRows).allSatisfy(row -> {
            assertThat(row.reservedStartTime()).isEqualTo(LocalTime.of(9, 0));
            assertThat(row.reservedEndTime()).isEqualTo(LocalTime.of(20, 0));
        });

        // "댄스동아리" — 꼬리 표기 없음 → 둘 다 null(SlotMerger 폴백 대상).
        List<ParsedReservation> plainRows = reservations.stream()
                .filter(row -> row.organizationName().equals("댄스동아리")).toList();
        assertThat(plainRows).hasSize(2);
        assertThat(plainRows).allSatisfy(row -> {
            assertThat(row.reservedStartTime()).isNull();
            assertThat(row.reservedEndTime()).isNull();
        });
    }

    @Test
    @DisplayName("역전 운영시간 (17:00~09:00) 은 범위만 null 폴백하고 원소는 스킵하지 않으며 꼬리 제거는 기존대로 수행한다")
    void reversedOperatingHoursFallBackToNullWithoutSkipping() throws IOException {
        JsonNode reversedTail = objectMapper.readTree("""
                [{"schedule_seq":"20001","schedule_dept":"야간동아리(17:00~09:00)",
                  "schedule_date":"03","schedule_time":"17:00~18:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(reversedTail, YearMonth.of(2026, 7));

        assertThat(reservations).hasSize(1); // 정책 ③: 원소 스킵 아님
        assertThat(reservations.get(0).organizationName()).isEqualTo("야간동아리"); // 꼬리 제거는 그대로
        assertThat(reservations.get(0).reservedStartTime()).isNull();
        assertThat(reservations.get(0).reservedEndTime()).isNull();
    }

    @Test
    @DisplayName("형식이 다른 꼬리 괄호는 기존처럼 조직명에 보존되고 운영시간은 null 이다")
    void malformedTailIsPreservedInOrganizationNameWithNullRange() throws IOException {
        JsonNode malformedTail = objectMapper.readTree("""
                [{"schedule_seq":"20002","schedule_dept":"밴드부(공연준비)",
                  "schedule_date":"04","schedule_time":"10:00~11:00"},
                 {"schedule_seq":"20003","schedule_dept":"연극부(9:00~)",
                  "schedule_date":"04","schedule_time":"11:00~12:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(malformedTail, YearMonth.of(2026, 7));

        assertThat(reservations).hasSize(2);
        assertThat(reservations).extracting(ParsedReservation::organizationName)
                .containsExactly("밴드부(공연준비)", "연극부(9:00~)"); // 시간형식 아닌 괄호는 제거 대상 아님(기존 유지)
        assertThat(reservations).allSatisfy(row -> {
            assertThat(row.reservedStartTime()).isNull();
            assertThat(row.reservedEndTime()).isNull();
        });
    }

    @Test
    @DisplayName("시작과 끝이 같은 운영시간 (9:00~9:00) 도 범위 null 폴백이다")
    void equalStartEndOperatingHoursFallBackToNull() throws IOException {
        JsonNode equalRangeTail = objectMapper.readTree("""
                [{"schedule_seq":"20004","schedule_dept":"바둑부(9:00~9:00)",
                  "schedule_date":"05","schedule_time":"09:00~10:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(equalRangeTail, YearMonth.of(2026, 7));

        assertThat(reservations).hasSize(1);
        assertThat(reservations.get(0).organizationName()).isEqualTo("바둑부");
        assertThat(reservations.get(0).reservedStartTime()).isNull();
        assertThat(reservations.get(0).reservedEndTime()).isNull();
    }

    @Test
    @DisplayName("빈 배열(200+[]) 픽스처는 빈 목록으로 파싱된다")
    void parsesEmptyArray() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room1_empty.json"), YearMonth.of(2026, 7));
        assertThat(reservations).isEmpty();
    }

    @Test
    @DisplayName("room143 픽스처의 예약을 파싱한다")
    void parsesRoom143() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room143.json"), YearMonth.of(2026, 7));
        assertThat(reservations).hasSize(1);
        assertThat(reservations.get(0).organizationName()).isEqualTo("총학생회");
        assertThat(reservations.get(0).reservationDate()).isEqualTo(LocalDate.of(2026, 7, 15));
    }
}
