package com.duing.domain.fee.service.dto.query;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * 이상징후 평가 결과(스펙 §7.9). 저장하지 않고 요청마다 그 자리에서 평가한 값이라
 * {@code evaluatedAt} 은 곧 응답 생성 시각이다(P2 배치가 스냅샷을 남기면 그때는 평가 시각이 된다).
 *
 * <p>{@code windowFrom}·{@code windowTo} 는 요청이 생략한 기본값(최근 30일)까지 확정한 실제 평가 구간이다 —
 * 버스트 Rule(FA-05·FA-06)과 계좌 Rule(FA-08)은 이 구간과 무관한 고유 윈도우로 평가되므로
 * 창에 없는 시점의 징후가 실릴 수 있다(스펙 §5.1).
 */
public record FeeAnomalyReport(
        Instant evaluatedAt,
        LocalDate windowFrom,
        LocalDate windowTo,
        List<FeeAnomaly> anomalies
) {
}
