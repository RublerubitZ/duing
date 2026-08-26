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
 * <p>꼬리 시간표기는 구분자가 의미를 가른다(실데이터 관찰 — 기본 확보 단체는 전부 물결, 하이픈은 실점유뿐):
 * <ul>
 *   <li>물결 "고정관념(9:00~20:00)" — 기본 확보 시간. 제거 전에 운영시간(reservedStart/End)으로
 *       추출한다(§16.1). 역전·형식 이상이면 범위만 null 폴백하고 원소는 스킵하지 않는다(정책 ③).</li>
 *   <li>하이픈 "학생생활상담센터(10:00-17:00)" — 실예약 범위. 학교가 시작·끝 마커 슬롯만 내려주므로
 *       start/end 를 표기 범위 전체로 확장해 일반 점유행이 되게 한다(전 구간 차단). 역전·형식 이상이면
 *       확장 없이 마커 슬롯을 유지한다(임의 추정 금지).</li>
 * </ul>
 * 파싱 불가 원소는 건너뛴다(사유별 건수만 로깅).
 */
@Slf4j
@Component
public class ReservationParser {

    // 꼬리 시간표기 추출+제거: 구분자(~/-)를 그룹으로 잡아 의미를 분기한다. 그 외 괄호는 보존.
    private static final Pattern TRAILING_TIME =
            Pattern.compile("\\s*\\((\\d{1,2}:\\d{2})\\s*([~-])\\s*(\\d{1,2}:\\d{2})\\)\\s*$");
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
            OperatingHours securedHours = OperatingHours.NONE;
            if (trailingTime.find()) {
                OperatingHours tailRange = parseOperatingHours(trailingTime.group(1), trailingTime.group(3));
                if (TIME_SEPARATOR.equals(trailingTime.group(2))) {
                    securedHours = tailRange; // 물결 = 기본 확보 시간(비차단 운영행, §16.1)
                } else if (tailRange != OperatingHours.NONE) {
                    // 하이픈 = 실예약 범위: 마커 슬롯 대신 표기 범위 전체를 점유행으로 저장(전 구간 차단).
                    // 파싱 실패(역전·형식 이상)면 확장 없이 마커 슬롯 유지 — 임의 추정 금지.
                    start = tailRange.start();
                    end = tailRange.end();
                }
            }
            String organization = trailingTime.replaceAll("").trim();
            return new ParsedReservation(scheduleSeq, reservationDate, start, end, organization,
                    securedHours.start(), securedHours.end());
        } catch (NumberFormatException | DateTimeException malformed) {
            return null; // 개별 원소 오류는 스킵(내용은 로깅하지 않음)
        }
    }

    /** 꼬리 운영시간(§16.1). NONE 은 표기 없음/파싱 실패 폴백(start·end 모두 null). */
    private record OperatingHours(LocalTime start, LocalTime end) {
        private static final OperatingHours NONE = new OperatingHours(null, null);
    }

    /** 꼬리 운영시간 파싱(§16.1 정책 ③) — 역전(end<=start)·형식 이상은 NONE 폴백, 원소 스킵 아님. */
    private OperatingHours parseOperatingHours(String startText, String endText) {
        try {
            LocalTime candidateStart = LocalTime.parse(startText, TIME);
            LocalTime candidateEnd = LocalTime.parse(endText, TIME);
            if (candidateEnd.isAfter(candidateStart)) {
                return new OperatingHours(candidateStart, candidateEnd);
            }
        } catch (DateTimeException malformedRange) {
            // 범위 파싱 실패는 폴백 — 아래 공통 반환으로 수렴
        }
        return OperatingHours.NONE;
    }
}
