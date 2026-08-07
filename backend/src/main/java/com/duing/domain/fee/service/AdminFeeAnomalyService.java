package com.duing.domain.fee.service;

import com.duing.domain.fee.service.dto.query.FeeAnomalyReport;
import java.time.LocalDate;

/** 총동연 회비 이상징후 평가(스펙 §5.1·§7.9) — 저장하지 않고 요청 시점에 8개 Rule 을 그 자리에서 평가한다. */
public interface AdminFeeAnomalyService {

    /**
     * 기간은 KST 날짜이며 {@code to} 는 포함이다. 생략하면 최근 30일({@code to}=오늘)로 채운다 —
     * 실제로 적용된 구간은 결과의 window 로 돌려준다.
     */
    FeeAnomalyReport evaluate(Long clubId, LocalDate from, LocalDate to);
}
