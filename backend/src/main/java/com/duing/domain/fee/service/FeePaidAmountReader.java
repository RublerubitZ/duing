package com.duing.domain.fee.service;

import com.duing.domain.fee.repository.PaymentRepository;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

/** 청구 목록의 ACTIVE 납부 합계를 한 번의 grouped 쿼리로 읽어 billId→합계 맵으로 돌려준다(N+1 회피). */
@Component
@RequiredArgsConstructor
public class FeePaidAmountReader {

    private final PaymentRepository paymentRepository;

    public Map<Long, Long> paidAmountByBillId(List<Long> feeBillIds) {
        if (feeBillIds.isEmpty()) {
            return Map.of();
        }
        return paymentRepository.sumActiveGroupedByFeeBillIds(feeBillIds).stream()
                .collect(Collectors.toMap(
                        row -> ((Number) row[0]).longValue(),
                        row -> ((Number) row[1]).longValue()));
    }
}
