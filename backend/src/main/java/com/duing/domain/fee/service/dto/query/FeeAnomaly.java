package com.duing.domain.fee.service.dto.query;

import java.util.Map;

/**
 * 탐지된 이상징후 1건(스펙 §5.1·§7.9). 미탐지 Rule 은 아예 만들어지지 않는다 — 응답에는 걸린 것만 실린다.
 *
 * <p>{@code evidence} 는 판정 근거를 화면이 다시 계산하지 않게 그대로 내려주는 값이라
 * 건수·비율·임계값만 담는다 — 회원 이름·행위자 같은 식별 정보는 절대 넣지 않는다(스펙 §9).
 */
public record FeeAnomaly(
        String ruleId,
        FeeAnomalySeverity severity,
        String title,
        String description,
        Map<String, Object> evidence
) {
}
