package com.duing.domain.fee.service;

import com.duing.domain.clubmember.service.ClubAuthService;
import com.duing.domain.fee.repository.FeeBillRepository;
import com.duing.domain.fee.repository.FeeBillSummaryProjection;
import com.duing.domain.fee.service.dto.query.FeeBillSummary;
import com.duing.domain.fee.service.dto.query.FeeBillSummaryQuery;
import java.time.Clock;
import java.time.LocalDate;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GeneralFeeBillSummaryService implements FeeBillSummaryService {

    private final FeeBillRepository feeBillRepository;
    private final ClubAuthService clubAuthService;
    private final Clock clock; // Asia/Seoul Clock 빈(상태별 카운트 표기 축 파생의 '오늘')

    @Override
    public FeeBillSummary getSummary(Long clubId, Long actorId, FeeBillSummaryQuery query) {
        clubAuthService.requireManager(actorId, clubId);

        // 청구 그레인 집계와 활성 납부 합계를 분리 산출한다. payment 를 fee_bill 에 조인해 한 번에 뽑으면
        // 1:N fan-out 으로 totalBilled 가 납부 건수만큼 중복 합산되므로 두 쿼리를 의도적으로 나눈다.
        FeeBillSummaryProjection billSummary = feeBillRepository.summarizeBills(clubId, query, LocalDate.now(clock));
        long totalPaid = feeBillRepository.sumActivePaid(clubId, query);
        long outstanding = billSummary.totalBilled() - totalPaid;
        double collectionRate = collectionRate(billSummary.totalBilled(), totalPaid);

        return new FeeBillSummary(
                billSummary.totalBilled(),
                totalPaid,
                outstanding,
                collectionRate,
                billSummary.billCount(),
                billSummary.pendingCount(),
                billSummary.partialPaidCount(),
                billSummary.overdueCount(),
                billSummary.paidCount());
    }

    // 수납률(%)을 소수점 1자리로 산출한다. 청구액이 0이면 0.0 으로 처리해 0으로 나누는 것을 막는다.
    private double collectionRate(long totalBilled, long totalPaid) {
        if (totalBilled == 0L) {
            return 0.0;
        }
        return Math.round(totalPaid * 1000.0 / totalBilled) / 10.0;
    }
}
