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
