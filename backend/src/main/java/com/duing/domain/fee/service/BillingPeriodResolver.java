package com.duing.domain.fee.service;

import com.duing.domain.fee.exception.FeeBillException;
import java.time.Clock;
import java.time.LocalDate;
import org.springframework.stereotype.Component;

@Component
public class BillingPeriodResolver {

    private final Clock clock; // Asia/Seoul Clock 빈 주입(기본 마감일 산출의 '오늘', 테스트 결정성)

    public BillingPeriodResolver(Clock clock) {
        this.clock = clock;
    }

    public record Resolved(String billingPeriod, LocalDate startDate, LocalDate endDate, LocalDate dueDate) {
    }

    public Resolved resolveMonthly(String yearMonth) {
        LocalDate start = parseFirstDayOfMonth(yearMonth);
        LocalDate end = start.withDayOfMonth(start.lengthOfMonth());
        return new Resolved(yearMonth, start, end, end); // 기본 마감 = 청구월 말일
    }

    public Resolved resolveYearly(String year, LocalDate dueOverride) {
        int resolvedYear = parseYear(year);
        LocalDate start = LocalDate.of(resolvedYear, 1, 1);
        LocalDate end = LocalDate.of(resolvedYear, 12, 31);
        // 기본 마감 = max(발행월 말일, 기간 시작일). 미래 연도 선발행 시 발행월 말일이 start 보다 과거가 되어
        // due < start(§5.1-1·chk_fee_bill_due_in_range)를 위반하므로 start 로 clamp 한다.
        LocalDate issueMonthEnd = issueMonthEnd();
        LocalDate defaultDue = issueMonthEnd.isBefore(start) ? start : issueMonthEnd;
        LocalDate due = dueOverride != null ? dueOverride : defaultDue;
        return new Resolved(year, start, end, due);
    }

    public Resolved resolveExplicit(String label, LocalDate start, LocalDate end, LocalDate due) {
        if (start == null || end == null || due == null || end.isBefore(start)) {
            throw new FeeBillException.InvalidBillingPeriodException();
        }
        return new Resolved(label, start, end, due);
    }

    private LocalDate issueMonthEnd() {
        LocalDate today = LocalDate.now(clock);
        return today.withDayOfMonth(today.lengthOfMonth());
    }

    private LocalDate parseFirstDayOfMonth(String yearMonth) {
        try {
            String[] parts = yearMonth.split("-");
            if (parts.length != 2) { // "2026", "2026-07-01" 등 형식 오류를 7월로 묵묵히 파싱하지 않도록 차단
                throw new FeeBillException.InvalidBillingPeriodException();
            }
            // Integer 파싱(NumberFormatException)·월 범위(DateTimeException) 모두 RuntimeException 으로 흡수.
            return LocalDate.of(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), 1);
        } catch (FeeBillException.InvalidBillingPeriodException alreadyMapped) {
            throw alreadyMapped;
        } catch (RuntimeException invalid) {
            throw new FeeBillException.InvalidBillingPeriodException();
        }
    }

    private int parseYear(String year) {
        try {
            return Integer.parseInt(year.trim());
        } catch (NumberFormatException invalid) {
            throw new FeeBillException.InvalidBillingPeriodException();
        }
    }
}
