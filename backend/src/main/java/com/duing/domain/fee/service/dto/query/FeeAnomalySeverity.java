package com.duing.domain.fee.service.dto.query;

/**
 * 이상징후 심각도(스펙 §5.1). 선언 순서가 곧 낮은 → 높은 순이라 응답 정렬(내림차순)이 이 순서를 뒤집어 쓴다 —
 * 값을 끼워 넣을 때 순서를 지켜야 정렬이 어긋나지 않는다.
 */
public enum FeeAnomalySeverity {

    /** 참고 — 정상 운영에서도 발생한다. */
    INFO,
    /** 패턴 주시. */
    WARNING,
    /** 감사 의견 작성 검토. */
    HIGH,
    /** 즉시 확인 — 수납 경로 변조 리스크. */
    CRITICAL
}
