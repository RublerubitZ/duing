package com.duing.domain.facility.service;

import com.duing.domain.facility.entity.DataSource;
import com.duing.domain.facility.entity.FetchStatus;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.YearMonth;

/**
 * 크롤 스냅샷 신선도(stale 플래그) 판정의 단일 소재지 — 표시용 소비자 3곳(시설 이용현황·예약 가용성·
 * 관리자 예약 상세)이 공유한다. STALE_CACHE 폴백·미수집(crawledAt null)·비 SUCCESS(PARTIAL 포함)는
 * 무조건 stale, 그 외에는 경과가 TTL 을 넘겼을 때만 stale — 정확히 TTL 인 순간은 신선이다.
 *
 * <p>TTL 은 정책 파라미터다: 이용현황은 월 의존({@link #ttlFor}), 예약 가용성·관리자 상세는 당월·익월
 * 전용 화면이라 고정 {@link #CURRENT_NEXT_TTL} 을 쓴다 — 요구가 실제로 달라 하나로 뭉치지 않는다.
 *
 * <p>크롤러의 재크롤 트리거(FacilityCrawlService.isFresh)는 의도적으로 이 판정 밖이다 — 경계가 반대
 * strict(경과 &lt; TTL 만 신선: 정확히 TTL 이면 재크롤)라 양쪽 다 자기 쪽으로 보수적이고, 소비 문맥
 * (표시 플래그 vs double-check 잠금 안의 트리거)이 다르다. TTL 값만 이 클래스의 상수로 공유한다.
 */
public final class SnapshotFreshnessPolicy {

    /** 당월·익월 TTL(선행 스펙 §5.5). */
    public static final Duration CURRENT_NEXT_TTL = Duration.ofMinutes(10);
    /** 그 외 월(과거·먼 미래) TTL — 변동이 드물어 길게 잡는다. */
    public static final Duration OTHER_MONTH_TTL = Duration.ofHours(24);

    private SnapshotFreshnessPolicy() {
    }

    public static boolean isStale(DataSource source, FetchStatus fetchStatus, LocalDateTime crawledAt,
            Duration ttl, LocalDateTime now) {
        if (source == DataSource.STALE_CACHE || crawledAt == null || fetchStatus != FetchStatus.SUCCESS) {
            return true;
        }
        return Duration.between(crawledAt, now).compareTo(ttl) > 0;
    }

    /** 월 의존 TTL — 당월·익월은 짧게, 그 외 월은 길게. currentMonth 는 호출부 Clock 기준으로 넘긴다. */
    public static Duration ttlFor(YearMonth yearMonth, YearMonth currentMonth) {
        if (yearMonth.equals(currentMonth) || yearMonth.equals(currentMonth.plusMonths(1))) {
            return CURRENT_NEXT_TTL;
        }
        return OTHER_MONTH_TTL;
    }
}
