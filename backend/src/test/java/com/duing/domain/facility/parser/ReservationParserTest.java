package com.duing.domain.facility.parser;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

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
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room4.json"), YearMonth.of(2026, 7)).reservations();

        // schedule_seq 18141 중복 1건 제거 → 4건
        assertThat(reservations).hasSize(4);
        assertThat(reservations).extracting(ParsedReservation::scheduleSeq)
                .containsExactlyInAnyOrder(18134L, 18135L, 18140L, 18141L);

        ParsedReservation first = reservations.stream().filter(r -> r.scheduleSeq() == 18134L).findFirst().orElseThrow();
        assertThat(first.organizationName()).isEqualTo("고정관념"); // "(9:00~20:00)" 제거
        assertThat(first.reservationDate()).isEqualTo(LocalDate.of(2026, 7, 1)); // date "01" + 2026-07
        // 꼬리 범위는 구분자 무관 실예약 구간이다 — 마커 슬롯(09~10)이 아니라 전 구간으로 확장된다.
        assertThat(first.startTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(first.endTime()).isEqualTo(LocalTime.of(20, 0));
    }

    @Test
    @DisplayName("물결 꼬리 (9:00~20:00) 는 기본 확보 시간 표기다 — 표기 범위 전체로 확장하되 securedTail 신호를 보존하고 꼬리 없는 행은 슬롯을 유지한다")
    void tildeTailExpandsSlotToWholeReservedRange() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room4.json"), YearMonth.of(2026, 7)).reservations();

        // "고정관념(9:00~20:00)" — 마커 두 건(09~10, 19~20) 모두 표기 범위 전체로 확장되고(V116 유지),
        // 물결 구분자는 기본 확보 시간 표기 신호로 보존된다(행 단위 정밀 분류 스펙 §1).
        List<ParsedReservation> expandedRows = reservations.stream()
                .filter(row -> row.organizationName().equals("고정관념")).toList();
        assertThat(expandedRows).hasSize(2);
        assertThat(expandedRows).allSatisfy(row -> {
            assertThat(row.startTime()).isEqualTo(LocalTime.of(9, 0));
            assertThat(row.endTime()).isEqualTo(LocalTime.of(20, 0));
            assertThat(row.securedTail()).isTrue();
        });

        // "댄스동아리" — 꼬리 표기 없음 → 원본 슬롯 그대로(임의 시간 생성 금지) + 확보 신호 없음(실예약).
        List<ParsedReservation> markerRows = reservations.stream()
                .filter(row -> row.organizationName().equals("댄스동아리")).toList();
        assertThat(markerRows)
                .extracting(ParsedReservation::startTime, ParsedReservation::endTime)
                .containsExactlyInAnyOrder(
                        tuple(LocalTime.of(9, 0), LocalTime.of(10, 0)),
                        tuple(LocalTime.of(10, 0), LocalTime.of(11, 0)));
        assertThat(markerRows).allSatisfy(row -> assertThat(row.securedTail()).isFalse());
    }

    @Test
    @DisplayName("하이픈 꼬리 (10:00-17:00) 는 실예약 범위다 — 표기 범위 전체로 확장되고 확보 신호는 남지 않는다")
    void hyphenTailExpandsSlotToWholeReservedRange() throws IOException {
        JsonNode hyphenTail = objectMapper.readTree("""
                [{"schedule_seq":"20005","schedule_dept":"학생생활상담센터(10:00-17:00)",
                  "schedule_date":"07","schedule_time":"10:00~11:00"},
                 {"schedule_seq":"20006","schedule_dept":"학생생활상담센터(10:00-17:00)",
                  "schedule_date":"07","schedule_time":"16:00~17:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(hyphenTail, YearMonth.of(2026, 7)).reservations();

        assertThat(reservations).hasSize(2);
        assertThat(reservations).allSatisfy(row -> {
            assertThat(row.organizationName()).isEqualTo("학생생활상담센터");
            assertThat(row.startTime()).isEqualTo(LocalTime.of(10, 0)); // 마커(10~11, 16~17) 아님
            assertThat(row.endTime()).isEqualTo(LocalTime.of(17, 0));
            assertThat(row.securedTail()).isFalse(); // 하이픈 = 실점유(구 main 실데이터 관찰)
        });
    }

    @Test
    @DisplayName("역전 하이픈 꼬리 (17:00-09:00) 는 확장하지 않고 마커 슬롯을 유지하며 꼬리만 제거한다 — 임의 추정 금지")
    void reversedHyphenTailKeepsMarkerSlotWithoutExpansion() throws IOException {
        JsonNode reversedHyphenTail = objectMapper.readTree("""
                [{"schedule_seq":"20007","schedule_dept":"야간센터(17:00-09:00)",
                  "schedule_date":"08","schedule_time":"17:00~18:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(reversedHyphenTail, YearMonth.of(2026, 7)).reservations();

        assertThat(reservations).hasSize(1);
        assertThat(reservations.get(0).organizationName()).isEqualTo("야간센터");
        assertThat(reservations.get(0).startTime()).isEqualTo(LocalTime.of(17, 0));
        assertThat(reservations.get(0).endTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(reservations.get(0).securedTail()).isFalse();
    }

    @Test
    @DisplayName("역전 물결 꼬리 (17:00~09:00) 는 확장 없이 마커 슬롯을 유지하고 확보 신호도 남기지 않는다 — 물결이어도 파싱 실패면 fail-closed")
    void reversedTildeTailKeepsMarkerSlotWithoutSkipping() throws IOException {
        JsonNode reversedTail = objectMapper.readTree("""
                [{"schedule_seq":"20001","schedule_dept":"야간동아리(17:00~09:00)",
                  "schedule_date":"03","schedule_time":"17:00~18:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(reversedTail, YearMonth.of(2026, 7)).reservations();

        assertThat(reservations).hasSize(1); // 정책 ③: 원소 스킵 아님
        assertThat(reservations.get(0).organizationName()).isEqualTo("야간동아리"); // 꼬리 제거는 그대로
        assertThat(reservations.get(0).startTime()).isEqualTo(LocalTime.of(17, 0));
        assertThat(reservations.get(0).endTime()).isEqualTo(LocalTime.of(18, 0));
        assertThat(reservations.get(0).securedTail()).isFalse(); // 물결이어도 역전이면 확보 신호 없음
    }

    @Test
    @DisplayName("형식이 다른 꼬리 괄호는 기존처럼 조직명에 보존되고 슬롯은 원본을 유지한다")
    void malformedTailIsPreservedInOrganizationName() throws IOException {
        JsonNode malformedTail = objectMapper.readTree("""
                [{"schedule_seq":"20002","schedule_dept":"밴드부(공연준비)",
                  "schedule_date":"04","schedule_time":"10:00~11:00"},
                 {"schedule_seq":"20003","schedule_dept":"연극부(9:00~)",
                  "schedule_date":"04","schedule_time":"11:00~12:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(malformedTail, YearMonth.of(2026, 7)).reservations();

        assertThat(reservations).hasSize(2);
        assertThat(reservations).extracting(ParsedReservation::organizationName)
                .containsExactly("밴드부(공연준비)", "연극부(9:00~)"); // 시간형식 아닌 괄호는 제거 대상 아님(기존 유지)
        assertThat(reservations).allSatisfy(row -> assertThat(row.securedTail()).isFalse());
    }

    @Test
    @DisplayName("시작과 끝이 같은 꼬리 (9:00~9:00) 는 확장하지 않고 마커 슬롯을 유지한다")
    void equalStartEndTailKeepsMarkerSlot() throws IOException {
        JsonNode equalRangeTail = objectMapper.readTree("""
                [{"schedule_seq":"20004","schedule_dept":"바둑부(9:00~9:00)",
                  "schedule_date":"05","schedule_time":"09:00~10:00"}]
                """);

        List<ParsedReservation> reservations = parser.parse(equalRangeTail, YearMonth.of(2026, 7)).reservations();

        assertThat(reservations).hasSize(1);
        assertThat(reservations.get(0).organizationName()).isEqualTo("바둑부");
        assertThat(reservations.get(0).startTime()).isEqualTo(LocalTime.of(9, 0));
        assertThat(reservations.get(0).endTime()).isEqualTo(LocalTime.of(10, 0));
        assertThat(reservations.get(0).securedTail()).isFalse(); // 파싱 실패 = fail-closed
    }

    @Test
    @DisplayName("빈 배열(200+[]) 픽스처는 빈 목록으로 파싱되고 부분 실패도 전부 실패도 아니다")
    void parsesEmptyArray() throws IOException {
        ReservationParseResult parseResult = parser.parse(loadFixture("room_data_list_room1_empty.json"), YearMonth.of(2026, 7));

        assertThat(parseResult.reservations()).isEmpty();
        assertThat(parseResult.skippedCount()).isZero();
        assertThat(parseResult.inputSize()).isZero();
        assertThat(parseResult.partial()).isFalse();
        assertThat(parseResult.allFailed()).isFalse();
    }

    @Test
    @DisplayName("원소 3건 중 1건이 형식 이상이면 성공 2건과 함께 건너뛴 건수 1 을 결과에 실어 부분 실패임을 드러낸다")
    void partiallyMalformedInputExposesSkippedCount() throws IOException {
        JsonNode partiallyMalformed = objectMapper.readTree("""
                [{"schedule_seq":"20010","schedule_dept":"밴드부",
                  "schedule_date":"04","schedule_time":"10:00~11:00"},
                 {"schedule_seq":"20011","schedule_dept":"연극부",
                  "schedule_date":"04","schedule_time":"미정"},
                 {"schedule_seq":"20012","schedule_dept":"댄스부",
                  "schedule_date":"05","schedule_time":"12:00~13:00"}]
                """);

        ReservationParseResult parseResult = parser.parse(partiallyMalformed, YearMonth.of(2026, 7));

        assertThat(parseResult.reservations()).extracting(ParsedReservation::scheduleSeq)
                .containsExactly(20010L, 20012L);
        assertThat(parseResult.skippedCount()).isEqualTo(1);
        assertThat(parseResult.inputSize()).isEqualTo(3);
        assertThat(parseResult.partial()).isTrue();
        assertThat(parseResult.allFailed()).isFalse();
    }

    @Test
    @DisplayName("원소가 있는데 전부 파싱 불가면 전부 실패로 판정된다 — 부분 실패와 구분된다")
    void allMalformedInputIsAllFailed() throws IOException {
        JsonNode allMalformed = objectMapper.readTree("""
                [{"renamed_seq":"20013","renamed_time":"10:00~11:00"},
                 {"renamed_seq":"20014","renamed_time":"12:00~13:00"}]
                """);

        ReservationParseResult parseResult = parser.parse(allMalformed, YearMonth.of(2026, 7));

        assertThat(parseResult.reservations()).isEmpty();
        assertThat(parseResult.skippedCount()).isEqualTo(2);
        assertThat(parseResult.inputSize()).isEqualTo(2);
        assertThat(parseResult.allFailed()).isTrue();
        assertThat(parseResult.partial()).isFalse();
    }

    @Test
    @DisplayName("배열이 아닌 객체 본문(필드 있음)은 빈 응답이 아니라 전부 파싱 실패로 판정된다 — 의심 본문으로 기존 행을 지우지 않는 방어선")
    void nonArrayObjectBodyIsAllFailed() throws IOException {
        JsonNode objectBody = objectMapper.readTree("""
                {"error":"session expired","code":401}
                """);

        ReservationParseResult parseResult = parser.parse(objectBody, YearMonth.of(2026, 7));

        assertThat(parseResult.reservations()).isEmpty();
        assertThat(parseResult.inputSize()).isEqualTo(2);
        assertThat(parseResult.allFailed()).isTrue();
        assertThat(parseResult.partial()).isFalse();
    }

    @Test
    @DisplayName("room143 픽스처의 예약을 파싱한다")
    void parsesRoom143() throws IOException {
        List<ParsedReservation> reservations = parser.parse(loadFixture("room_data_list_room143.json"), YearMonth.of(2026, 7)).reservations();
        assertThat(reservations).hasSize(1);
        assertThat(reservations.get(0).organizationName()).isEqualTo("총학생회");
        assertThat(reservations.get(0).reservationDate()).isEqualTo(LocalDate.of(2026, 7, 15));
    }
}
