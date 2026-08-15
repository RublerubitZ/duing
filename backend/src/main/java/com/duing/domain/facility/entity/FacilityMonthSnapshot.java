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
import java.util.ArrayList;
import java.util.List;
import lombok.AccessLevel;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

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

    /**
     * 이 세대({@link #crawledAt})에 수집·영속까지 성공한 시설 id 집합(§5.3 세대 결박의 근거).
     * 예약 행은 변경분만 차등 반영되어 행의 crawled_at 이 세대 표식이 될 수 없으므로, "어느 시설이
     * 이 세대 기준으로 최신인가"를 월 메타에 함께 남긴다. 여기 없는 시설은 fetch/쓰기 실패·데드라인
     * 스킵으로 구세대 행이 잔존한다는 뜻이라 자동 확정에서 fail-closed 로 제외된다.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "synced_facility_ids", columnDefinition = "jsonb", nullable = false)
    private List<Long> syncedFacilityIds = new ArrayList<>();

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

    /**
     * 성공/부분성공: crawled_at 갱신(마지막 성공 시각), fetch_status/last_error 기록.
     * syncedFacilityIds 는 이 세대에 수집·영속까지 성공한 시설 집합으로 통째 교체한다 —
     * 세대가 바뀌면 이전 세대의 성공 집합은 더 이상 유효하지 않다.
     */
    public void recordSuccessful(LocalDateTime crawledAt, CrawlSource source, FetchStatus fetchStatus,
                                 String lastError, List<Long> syncedFacilityIds) {
        this.crawledAt = crawledAt;
        this.source = source;
        this.fetchStatus = fetchStatus;
        this.lastError = truncate(lastError);
        this.syncedFacilityIds = new ArrayList<>(syncedFacilityIds);
    }

    /**
     * 전체 실패: crawled_at 은 보존(stale/TTL 기준 유지), fetch_status=FAILED·last_error 만 기록.
     * crawled_at 을 보존하므로 세대가 그대로다 — syncedFacilityIds 도 그 세대를 계속 서술하므로 건드리지 않는다.
     */
    public void recordFailure(CrawlSource source, String lastError) {
        this.source = source;
        this.fetchStatus = FetchStatus.FAILED;
        this.lastError = truncate(lastError);
    }

    /** 이 시설이 현재 세대({@link #crawledAt}) 기준으로 최신인가 — 자동 확정의 세대 결박 판별식(§5.3). */
    public boolean isFacilitySynced(Long facilityId) {
        return syncedFacilityIds.contains(facilityId);
    }

    /**
     * 예외 메시지에는 크롤 원문(이모지 포함 가능)이 실릴 수 있어 서로게이트 쌍을 보존해 절단한다.
     * 쌍을 쪼개면 고아 서로게이트가 남아 UTF-8 인코딩 단계에서 메타 기록 자체가 실패한다.
     */
    private static String truncate(String error) {
        if (error == null || error.length() <= MAX_ERROR_LENGTH) {
            return error;
        }
        int end = MAX_ERROR_LENGTH;
        if (Character.isHighSurrogate(error.charAt(end - 1))) {
            end--;
        }
        return error.substring(0, end);
    }
}
