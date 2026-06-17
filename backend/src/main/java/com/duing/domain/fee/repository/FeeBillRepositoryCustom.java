package com.duing.domain.fee.repository;

import com.duing.domain.fee.entity.FeeBill;
import com.duing.domain.fee.service.dto.query.BillSearchQuery;
import com.duing.domain.fee.service.dto.query.FeeBillSummaryQuery;
import com.duing.domain.fee.service.dto.query.MyFeeSearchQuery;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

public interface FeeBillRepositoryCustom {

    Page<FeeBill> searchClubBills(Long clubId, BillSearchQuery query, Pageable pageable);

    List<FeeBill> searchMyBills(Long userId, MyFeeSearchQuery query);

    FeeBillSummaryProjection summarizeBills(Long clubId, FeeBillSummaryQuery query);

    long sumActivePaid(Long clubId, FeeBillSummaryQuery query);

    // 입금액과 잔액(청구액 − 활성 납부합)이 정확히 일치하는 동아리 내 미납 청구 후보를 마감일 오름차순으로 반환한다.
    List<MatchCandidate> findMatchCandidates(Long clubId, long depositAmount);
}
