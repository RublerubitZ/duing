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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 예약 JSON 배열 → List&lt;ParsedReservation&gt;. schedule_seq distinct, dept 꼬리 시간표기 제거(§6.2),
 * schedule_date(일) + YearMonth → LocalDate, schedule_time '19:00~20:00' → start/end LocalTime.
 *
 * <p>꼬리 시간표기 (H:MM~H:MM)/(H:MM-H:MM) 는 구분자와 무관하게 **실예약 범위**다(2026-08-27 전면 차단 정책).
 * 학교가 시작·끝 마커 슬롯만 내려주므로 start/end 를 표기 범위 전체로 확장해 [start, end) 전 구간이
 * 점유행이 되게 한다. 역전(end&lt;=start)·형식 이상이면 확장 없이 마커 슬롯을 유지한다(임의 추정 금지).
 * 파싱 불가 원소는 건너뛴다(사유별 건수만 로깅).
 */
@Slf4j
@Component
public class ReservationParser {

    // 꼬리 시간표기 추출+제거: 구분자(~/-)는 표기 관행 차이일 뿐 의미 차이가 없다. 그 외 괄호는 보존.
    private static final Pattern TRAILING_TIME =
            Pattern.compile("\\s*\\((\\d{1,2}:\\d{2})\\s*[~-]\\s*(\\d{1,2}:\\d{2})\\)\\s*$");
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
            Matcher trailingTime = TRAILING_TIME.matcher(deptText.trim());
            if (trailingTime.find()) {
                TailRange tailRange = parseTailRange(trailingTime.group(1), trailingTime.group(2));
                if (tailRange != TailRange.NONE) {
                    // 꼬리 범위 = 실예약 구간: 마커 슬롯 대신 표기 범위 전체를 점유행으로 저장(전 구간 차단).
                    // 파싱 실패(역전·형식 이상)면 확장 없이 마커 슬롯 유지 — 임의 추정 금지.
                    start = tailRange.start();
                    end = tailRange.end();
                }
            }
            String organization = trailingTime.replaceAll("").trim();
            // reserved(구 기본 확보 시간) 추출 중단 — 항상 null(전면 차단 정책, 필드 제거는 후속 단계).
            return new ParsedReservation(scheduleSeq, reservationDate, start, end, organization, null, null);
        } catch (NumberFormatException | DateTimeException malformed) {
            return null; // 개별 원소 오류는 스킵(내용은 로깅하지 않음)
        }
    }

    /** 꼬리 시간 범위. NONE 은 파싱 실패 폴백(확장하지 않음). */
    private record TailRange(LocalTime start, LocalTime end) {
        private static final TailRange NONE = new TailRange(null, null);
    }

    /** 꼬리 범위 파싱 — 역전(end<=start)·형식 이상은 NONE 폴백, 원소 스킵 아님. */
    private TailRange parseTailRange(String startText, String endText) {
        try {
            LocalTime candidateStart = LocalTime.parse(startText, TIME);
            LocalTime candidateEnd = LocalTime.parse(endText, TIME);
            if (candidateEnd.isAfter(candidateStart)) {
                return new TailRange(candidateStart, candidateEnd);
            }
        } catch (DateTimeException malformedRange) {
            // 범위 파싱 실패는 폴백 — 아래 공통 반환으로 수렴
        }
        return TailRange.NONE;
    }
}
