package com.duing.domain.fee.service;

import com.duing.domain.fee.controller.dto.response.FeeBillResponse;
import com.duing.domain.fee.entity.FeePolicy;
import com.duing.domain.fee.service.dto.command.GenerateBillsCommand;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.GenerateBillsResult;
import java.time.LocalDate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FeeBillService {
    GenerateBillsResult generate(GenerateBillsCommand command);

    void cancel(Long clubId, Long actorId, Long billId);

    Page<FeeBillResponse> getBills(Long clubId, Long actorId, BillSearchQuery query, Pageable pageable);

    // 크론 전용 발행 경로(권한·과거검증 없음, 시스템 권위). 정책의 그 달(today 기준) 청구를 멱등 발행한다.
    void autoIssueMonthly(FeePolicy policy, LocalDate today);
}
