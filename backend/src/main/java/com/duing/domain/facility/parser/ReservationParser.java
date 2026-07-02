package com.duing.domain.facility.parser;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 예약 JSON 배열 → List&lt;ParsedReservation&gt;. schedule_seq distinct, dept 꼬리 시간표기 제거(§6.2),
 * schedule_date(일) + YearMonth → LocalDate, schedule_time '19:00~20:00' → start/end LocalTime.
 * 파싱 불가 원소는 건너뛴다(사유별 건수만 로깅, 배치 크래시 방지).
 */
@Slf4j
@Component
public class ReservationParser {

    // 꼬리 시간표기만 제거: "고정관념(9:00~20:00)" → "고정관념". 그 외 괄호는 보존.
    private static final Pattern TRAILING_TIME = Pattern.compile("\\s*\\(\\d{1,2}:\\d{2}\\s*~\\s*\\d{1,2}:\\d{2}\\)\\s*$");
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("H:mm");
    private static final String TIME_SEPARATOR = "~";

    public List<ParsedReservation> parse(JsonNode arrayNode, YearMonth yearMonth) {
        // LinkedHashMap: schedule_seq 로 distinct 하되 최초 입력 순서를 보존한다.
        Map<Long, ParsedReservation> bySeq = new LinkedHashMap<>();
        if (arrayNode == null || !arrayNode.isArray()) {
            return new ArrayList<>();
        }
        int skipped = 0;
        for (JsonNode element : arrayNode) {
            ParsedReservation reservation = parseElement(element, yearMonth);
            if (reservation == null) {
                skipped++;
                continue;
            }
            bySeq.putIfAbsent(reservation.scheduleSeq(), reservation);
        }
        if (skipped > 0) {
            log.warn("시설 예약 파싱 건너뜀: yearMonth={}, skipped={}", yearMonth, skipped);
        }
        return new ArrayList<>(bySeq.values());
    }

    private ParsedReservation parseElement(JsonNode element, YearMonth yearMonth) {
        String seqText = element.path("schedule_seq").asText("");
        String dateText = element.path("schedule_date").asText("");
        String timeText = element.path("schedule_time").asText("");
        String deptText = element.path("schedule_dept").asText("");
        if (seqText.isBlank() || dateText.isBlank() || timeText.isBlank()) {
            return null;
        }
        try {
            long scheduleSeq = Long.parseLong(seqText.trim());
            LocalDate reservationDate = yearMonth.atDay(Integer.parseInt(dateText.trim()));
            String[] slot = timeText.split(TIME_SEPARATOR);
            if (slot.length != 2) {
                return null;
            }
            LocalTime start = LocalTime.parse(slot[0].trim(), TIME);
            LocalTime end = LocalTime.parse(slot[1].trim(), TIME);
            String organization = TRAILING_TIME.matcher(deptText.trim()).replaceAll("").trim();
            return new ParsedReservation(scheduleSeq, reservationDate, start, end, organization);
        } catch (NumberFormatException | DateTimeException malformed) {
            return null; // 개별 원소 오류는 스킵(내용은 로깅하지 않음)
        }
    }
}
