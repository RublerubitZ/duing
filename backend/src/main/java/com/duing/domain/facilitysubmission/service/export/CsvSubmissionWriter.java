package com.duing.domain.facilitysubmission.service.export;

import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.util.Locale;
import org.springframework.stereotype.Component;

/** 첫 번째 Export Writer(스펙 §6) — Excel 호환 CSV: UTF-8 BOM + CRLF + 수식 인젝션 방지. */
@Component
public class CsvSubmissionWriter {

    private static final byte[] UTF8_BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final String[] HEADER = {"제출번호", "시설명", "예약일", "요일", "예약 시작시간", "예약 종료시간",
            "동아리명", "신청자", "연락처", "사용인원", "사용목적", "승인자", "승인일시", "비고"};
    private static final DateTimeFormatter DATE_TIME_PATTERN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    public byte[] write(SubmissionExportData exportData) {
        StringBuilder csv = new StringBuilder();
        appendRow(csv, HEADER);
        for (SubmissionExportRow row : exportData.rows()) {
            appendRow(csv, new String[] {
                    exportData.submissionNo(),
                    exportData.facilityName(),
                    row.reservationDate().toString(),
                    row.reservationDate().getDayOfWeek().getDisplayName(TextStyle.SHORT, Locale.KOREAN),
                    row.startTime().toString(),
                    row.endTime().toString(),
                    row.clubName(),
                    row.applicantName(),
                    row.contactPhone(),
                    row.attendeeCount() != null ? String.valueOf(row.attendeeCount()) : "",
                    row.purpose(),
                    row.deciderName(),
                    row.decidedAt() != null ? DATE_TIME_PATTERN.format(row.decidedAt()) : "",
                    exportData.memo()});
        }
        byte[] body = csv.toString().getBytes(StandardCharsets.UTF_8);
        byte[] withBom = new byte[UTF8_BOM.length + body.length];
        System.arraycopy(UTF8_BOM, 0, withBom, 0, UTF8_BOM.length);
        System.arraycopy(body, 0, withBom, UTF8_BOM.length, body.length);
        return withBom;
    }

    private void appendRow(StringBuilder csv, String[] cells) {
        for (int cellIndex = 0; cellIndex < cells.length; cellIndex++) {
            if (cellIndex > 0) {
                csv.append(',');
            }
            csv.append(escape(guardFormula(cells[cellIndex])));
        }
        csv.append("\r\n");
    }

    /** Excel 수식 인젝션 방지 — 위험 선행 문자에 작은따옴표를 전치한다(프론트 동아리 멤버 명단 CSV membersCsv.ts 의 규칙을 백엔드로 이식). */
    private String guardFormula(String cell) {
        if (cell == null || cell.isEmpty()) {
            return cell;
        }
        char firstChar = cell.charAt(0);
        if (firstChar == '=' || firstChar == '+' || firstChar == '-' || firstChar == '@' || firstChar == '\t') {
            return "'" + cell;
        }
        return cell;
    }

    private String escape(String cell) {
        if (cell == null) {
            return "";
        }
        if (cell.contains(",") || cell.contains("\"") || cell.contains("\n") || cell.contains("\r")) {
            return '"' + cell.replace("\"", "\"\"") + '"';
        }
        return cell;
    }
}
