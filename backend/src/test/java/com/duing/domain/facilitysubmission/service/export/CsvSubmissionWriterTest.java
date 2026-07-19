package com.duing.domain.facilitysubmission.service.export;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class CsvSubmissionWriterTest {

    private final CsvSubmissionWriter csvWriter = new CsvSubmissionWriter();

    /** 다음 주 월요일 — 상대 날짜(타임밤 금지) + 요일 한글 검증을 결정적으로 만든다. */
    private static final LocalDate NEXT_MONDAY =
            LocalDate.now().plusDays(8 - LocalDate.now().getDayOfWeek().getValue());

    private SubmissionExportData exportData(SubmissionExportRow... rows) {
        return new SubmissionExportData("SUB-20260801-001", "학생회관 강당", "8월 1차",
                "facility-submission-SUB-20260801-001.csv", List.of(rows));
    }

    private SubmissionExportRow row(String clubName, String purpose) {
        return new SubmissionExportRow(NEXT_MONDAY, LocalTime.of(18, 0), LocalTime.of(21, 0),
                clubName, "홍길동", "010-1234-5678", 30, purpose, "관리자",
                LocalDateTime.of(NEXT_MONDAY.minusDays(3), LocalTime.of(10, 30)));
    }

    @Test
    @DisplayName("CSV 는 UTF-8 BOM 으로 시작하고 CRLF 로 줄을 끝내며 14개 컬럼 헤더를 가진다")
    void bomCrlfAndHeaderColumns() {
        byte[] csvBytes = csvWriter.write(exportData(row("합주부", "정기 합주")));

        assertThat(Arrays.copyOfRange(csvBytes, 0, 3))
                .containsExactly((byte) 0xEF, (byte) 0xBB, (byte) 0xBF);
        String csvText = new String(csvBytes, 3, csvBytes.length - 3, StandardCharsets.UTF_8);
        String[] lines = csvText.split("\r\n");
        assertThat(lines).hasSize(2);
        assertThat(lines[0].split(",", -1)).containsExactly(
                "제출번호", "시설명", "예약일", "요일", "예약 시작시간", "예약 종료시간",
                "동아리명", "신청자", "연락처", "사용인원", "사용목적", "승인자", "승인일시", "비고");
    }

    @Test
    @DisplayName("본문 행에 제출번호·시설명·한글 요일·승인일시가 채워진다")
    void bodyRowContainsDerivedFields() {
        byte[] csvBytes = csvWriter.write(exportData(row("합주부", "정기 합주")));
        String bodyLine = new String(csvBytes, StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine).startsWith("SUB-20260801-001,학생회관 강당,");
        assertThat(bodyLine).contains(",월,");
        assertThat(bodyLine).contains("18:00,21:00");
        assertThat(bodyLine).endsWith(",8월 1차");
    }

    @Test
    @DisplayName("쉼표·따옴표가 든 값은 인용되고 따옴표는 이중으로 이스케이프된다")
    void commaAndQuoteAreEscaped() {
        byte[] csvBytes = csvWriter.write(exportData(row("합주,부", "말 그대로 \"연습\"")));
        String bodyLine = new String(csvBytes, StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine).contains("\"합주,부\"");
        assertThat(bodyLine).contains("\"말 그대로 \"\"연습\"\"\"");
    }

    @Test
    @DisplayName("수식 선행 문자(= + - @)로 시작하는 값은 작은따옴표가 전치된다")
    void formulaInjectionIsNeutralized() {
        byte[] csvBytes = csvWriter.write(exportData(row("=SUM(A1:A9)", "@행사")));
        String bodyLine = new String(csvBytes, StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine).contains("'=SUM(A1:A9)");
        assertThat(bodyLine).contains("'@행사");
    }

    @Test
    @DisplayName("쉼표가 든 수식 값은 작은따옴표 전치 후 인용된다 — 가드와 이스케이프 순서 회귀 방지")
    void formulaGuardAppliesBeforeCommaQuoting() {
        byte[] csvBytes = csvWriter.write(exportData(row("=SUM(A1,B1)", "정기 합주")));
        String bodyLine = new String(csvBytes, StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine).contains("\"'=SUM(A1,B1)\"");
    }

    @Test
    @DisplayName("null 값(인원·메모 등)은 빈 문자열로 출력된다")
    void nullValuesBecomeEmptyCells() {
        SubmissionExportData dataWithNulls = new SubmissionExportData("SUB-20260801-002", "체육관", null,
                "facility-submission-SUB-20260801-002.csv",
                List.of(new SubmissionExportRow(NEXT_MONDAY, LocalTime.of(9, 0), LocalTime.of(10, 0),
                        "농구부", "김철수", null, null, "연습", null, null)));

        String bodyLine = new String(csvWriter.write(dataWithNulls), StandardCharsets.UTF_8).split("\r\n")[1];

        assertThat(bodyLine.split(",", -1)).hasSize(14);
        assertThat(bodyLine).endsWith(",,");
    }
}
