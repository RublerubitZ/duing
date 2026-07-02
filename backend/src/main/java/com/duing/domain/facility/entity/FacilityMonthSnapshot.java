package com.duing.domain.facility.entity;

import com.duing.domain.facility.converter.YearMonthAttributeConverter;
import com.duing.global.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.time.YearMonth;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Entity
@Table(name = "facility_month_snapshot")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class FacilityMonthSnapshot extends BaseEntity {

    private static final int MAX_ERROR_LENGTH = 500;

    @Convert(converter = YearMonthAttributeConverter.class)
    @Column(name = "year_month", nullable = false, unique = true, length = 7)
    private YearMonth yearMonth;

    @Column(name = "crawled_at", nullable = false)
    private LocalDateTime crawledAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 20)
    private CrawlSource source;

    @Enumerated(EnumType.STRING)
    @Column(name = "fetch_status", nullable = false, length = 20)
    private FetchStatus fetchStatus;

    @Column(name = "last_error", length = MAX_ERROR_LENGTH)
    private String lastError;

    @Builder(access = AccessLevel.PRIVATE)
    private FacilityMonthSnapshot(YearMonth yearMonth, LocalDateTime crawledAt, CrawlSource source,
                                  FetchStatus fetchStatus, String lastError) {
        this.yearMonth = yearMonth;
        this.crawledAt = crawledAt;
        this.source = source;
        this.fetchStatus = fetchStatus;
        this.lastError = lastError;
    }

    public static FacilityMonthSnapshot create(YearMonth yearMonth, LocalDateTime crawledAt, CrawlSource source,
                                               FetchStatus fetchStatus, String lastError) {
        return FacilityMonthSnapshot.builder()
                .yearMonth(yearMonth)
                .crawledAt(crawledAt)
                .source(source)
                .fetchStatus(fetchStatus)
                .lastError(truncate(lastError))
                .build();
    }

    /** 성공/부분성공: crawled_at 갱신(마지막 성공 시각), fetch_status/last_error 기록. */
    public void recordSuccessful(LocalDateTime crawledAt, CrawlSource source, FetchStatus fetchStatus, String lastError) {
        this.crawledAt = crawledAt;
        this.source = source;
        this.fetchStatus = fetchStatus;
        this.lastError = truncate(lastError);
    }

    /** 전체 실패: crawled_at 은 보존(stale/TTL 기준 유지), fetch_status=FAILED·last_error 만 기록. */
    public void recordFailure(CrawlSource source, String lastError) {
        this.source = source;
        this.fetchStatus = FetchStatus.FAILED;
        this.lastError = truncate(lastError);
    }

    private static String truncate(String error) {
        if (error == null) {
            return null;
        }
        return error.length() <= MAX_ERROR_LENGTH ? error : error.substring(0, MAX_ERROR_LENGTH);
    }
}
